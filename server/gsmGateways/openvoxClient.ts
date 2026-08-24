import crypto from 'node:crypto';
import http from 'node:http';

export type OpenVoxConfig = { baseUrl: string; username: string; password: string; timeoutMs: number };

function digestFields(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of header.replace(/^Digest\s+/i, '').matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) result[match[1]] = match[2] ?? match[3];
  return result;
}

function md5(value: string) { return crypto.createHash('md5').update(value).digest('hex'); }

export class OpenVoxClient {
  constructor(private readonly config: OpenVoxConfig) {}

  private request(path: string, authorization?: string, method = 'GET', body = '', contentType='application/x-www-form-urlencoded'): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    const target = new URL(path, this.config.baseUrl);
    return new Promise((resolve, reject) => {
      const headers:Record<string,string> = authorization ? { Authorization: authorization } : {};
      if (body) { headers['Content-Type']=contentType; headers['Content-Length']=String(Buffer.byteLength(body)); }
      const req = http.request(target, { method, headers, timeout: this.config.timeoutMs }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('timeout', () => req.destroy(new Error('openvox_timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }

  async get(path: string): Promise<string> {
    return this.perform(path, 'GET', '');
  }

  async postForm(path: string, values: URLSearchParams): Promise<string> {
    return this.perform(path, 'POST', values.toString());
  }

  async postMultipart(path:string,values:Record<string,string|string[]>):Promise<string>{
    const boundary=`----PBXPuls${crypto.randomBytes(12).toString('hex')}`,parts:string[]=[];
    for(const [name,raw] of Object.entries(values))for(const value of Array.isArray(raw)?raw:[raw])parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name.replace(/["\r\n]/g,'')}"\r\n\r\n${String(value)}\r\n`);
    parts.push(`--${boundary}--\r\n`);
    return this.perform(path,'POST',parts.join(''),`multipart/form-data; boundary=${boundary}`);
  }

  private async perform(path:string, method:string, body:string,contentType='application/x-www-form-urlencoded'):Promise<string> {
    const uri = new URL(path, this.config.baseUrl).pathname + new URL(path, this.config.baseUrl).search;
    let result = await this.request(path, undefined, method, body,contentType);
    for (let attempt = 1; result.status === 401 && attempt <= 3; attempt += 1) {
      const challenge = digestFields(String(result.headers['www-authenticate'] || ''));
      if (!challenge.realm || !challenge.nonce) throw new Error('openvox_digest_challenge_invalid');
      const nc = String(attempt).padStart(8, '0'), cnonce = crypto.randomBytes(8).toString('hex'), qop = challenge.qop?.split(',')[0]?.trim() || 'auth';
      const ha1 = md5(`${this.config.username}:${challenge.realm}:${this.config.password}`), ha2 = md5(`${method}:${uri}`);
      const response = md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
      const authorization = `Digest username="${this.config.username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
      result = await this.request(path, authorization, method, body,contentType);
    }
    if (result.status < 200 || result.status >= 300) throw new Error(result.status === 401 ? 'openvox_auth_failed' : `openvox_http_${result.status}`);
    return result.body;
  }
}

export function signalLevel(csq: unknown): 'offline' | 'weak' | 'fair' | 'good' | 'excellent' {
  const value = Number(csq);
  if (!Number.isFinite(value) || value < 0 || value === 99) return 'offline';
  if (value < 10) return 'weak';
  if (value < 15) return 'fair';
  if (value < 20) return 'good';
  return 'excellent';
}

export function parseOpenVoxGsm(body: string, board: number) {
  const parsed = JSON.parse(body);
  const ports: any[] = [];
  for (const [port, groups] of Object.entries(parsed || {})) for (const row of Array.isArray(groups) ? groups : []) ports.push({
    id: `gsm-${board}.${port}`, board, port: Number(port), signal: Number((row as any).signal), signalLevel: signalLevel((row as any).signal),
    ber: Number((row as any).ber), operatorCode: String((row as any).operator || ''), registration: String((row as any).register || ''),
    state: String((row as any).state || ''), pdd: Number((row as any).pdd || 0), acd: Number((row as any).acd || 0),
    asr: Number((row as any).asr || 0), remainTime: String((row as any).remain_time || ''), ready: String((row as any).state || '').toUpperCase() === 'READY'
  });
  return ports;
}

const text = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();

export function parseOpenVoxPortIdentities(html:string):Record<string,string>{
  const result:Record<string,string>={};
  for(const match of html.matchAll(/\b(gsm-\d+\.\d)\((\d{7,15})\)/gi)) result[match[1].toLowerCase()]=match[2];
  return result;
}

export function parseOpenVoxRoutes(html:string){
  const section=html.match(/Routing Information[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)?.[1]||'',rows:any[]=[];
  for(const row of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>text(cell[1]));if(cells.length>=3)rows.push({name:cells[0],from:cells[1],to:cells[2],rules:cells[3]||''});}
  return rows;
}

export function parseOpenVoxSmsHistory(html:string,box:'inbox'|'outbox'){
  const total=Number(html.match(/Total Records:\s*(\d+)/i)?.[1]||0),totalPages=Number(html.match(/total pages:\s*(\d+)/i)?.[1]||1),section=html.match(/Total Records:[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)?.[1]||'',items:any[]=[];
  for(const row of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>text(cell[1]));if(cells.length<(box==='outbox'?6:5)||!/^gsm-\d+\.\d$/i.test(cells[1]))continue;items.push({port:cells[1],phoneNumber:cells[2],time:cells[3],status:box==='outbox'?cells[4]:null,message:cells[box==='outbox'?5:4]});}
  return{total,totalPages,items};
}

export function parseOpenVoxUssdResponse(body:string):string{
  const raw=body.replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  if(!raw)return'';
  try{
    const parsed=JSON.parse(raw),values:string[]=[];
    const visit=(value:any,key='')=>{if(value&&typeof value==='object'){for(const [childKey,child] of Object.entries(value))visit(child,childKey);return;}if(typeof value==='string'&&/^(response|ussd|content|text|message)$/i.test(key))values.push(value.trim());};
    visit(parsed);
    return values.find(value=>value&&!/^\*.*#$/.test(value)&&!/^(sending|success|ok|fail(?:ed)?)$/i.test(value))||'';
  }catch{return /^(sending|success|ok|fail(?:ed)?)$/i.test(raw)?'':raw;}
}

export function parseOpenVoxSipEndpoints(html: string) {
  const section = html.match(/SIP Information[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i)?.[1] || '';
  const endpoints: any[] = [];
  for (const row of section.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
    if (cells.length < 5) continue;
    const latency = cells[4].match(/(\d+)\s*ms/i);
    endpoints.push({ name: cells[0], username: cells[1], host: cells[2], registrationMode: cells[3], status: cells[4], reachable: /^OK\b/i.test(cells[4]), latencyMs: latency ? Number(latency[1]) : null });
  }
  return endpoints;
}

export function detectOpenVoxBoardCount(html: string, fallback = 1): number {
  const boards = [...html.matchAll(/(?:id\s*=\s*["']?gsm_|\bgsm-)(\d+)[_.]\d/gi)].map(match => Number(match[1])).filter(Number.isFinite);
  return Math.max(1, Math.min(5, boards.length ? Math.max(...boards) : fallback));
}
