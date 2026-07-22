import crypto from 'crypto';

type ToolInput = Record<string, any>;
type ToolOutput = Record<string, any>;
type PBXReadService = (input: ToolInput, signal?: AbortSignal) => Promise<ToolOutput>;

export interface PBXReadServices {
  activeCalls: PBXReadService;
  sipRegistrations: PBXReadService;
  trunksStatus: PBXReadService;
  extensionsStatus: PBXReadService;
  missedCalls: PBXReadService;
  callStatistics: PBXReadService;
  searchContacts: PBXReadService;
  searchHistory: PBXReadService;
}

type FixedDiagnostic = 'channels' | 'pjsip_contacts' | 'sip_peers' | 'sip_registry';
type DiagnosticResult = { success: boolean; message: string };

export interface AuthoritativeExtension {
  ext?: unknown;
  name?: unknown;
  status?: unknown;
  tech?: unknown;
  deviceRole?: unknown;
}

export interface PBXReadServiceDeps {
  runFixedDiagnostic(command: FixedDiagnostic): Promise<DiagnosticResult>;
  parseChannels(text: string): any[];
  parsePjsip(text: string): Map<string, any>;
  parseSipPeers(text: string): Map<string, any>;
  queryCdr(sql: string, params: unknown[]): Promise<any[]>;
  readDirectory(): Promise<any[]>;
  readAuthoritativeExtensions(): Promise<AuthoritativeExtension[]>;
}

export function maskPhone(value: unknown): string {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 5) return '***';
  return `${raw.startsWith('+') ? '+' : ''}${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

export function maskIp(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '***';
  if (text.includes(':')) return `${text.split(':').slice(0, 2).join(':')}:***`;
  const parts = text.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : '***';
}

export function maskSipContact(value: unknown): string {
  return String(value ?? '')
    .replace(/(sips?:)([^@\s]+)@/i, '$1***@')
    .replace(/((?:\d{1,3}\.){2})\d{1,3}\.\d{1,3}/g, '$1x.x');
}

export function safeExtension(value: unknown): string {
  const extension = String(value ?? '').trim();
  return /^\d{2,6}$/.test(extension) ? extension : '';
}

const boundedLimit = (value: unknown, maximum = 100): number =>
  Math.max(1, Math.min(Number(value) || 20, maximum));
const sqlDate = (value: Date): string => value.toISOString().slice(0, 19).replace('T', ' ');
const safeFilter = (value: unknown, maximum = 100): string => String(value ?? '').trim().slice(0, maximum);

function periodRange(period: unknown): [Date, Date] {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'today') from.setHours(0, 0, 0, 0);
  else if (period === 'yesterday') {
    from.setDate(from.getDate() - 1);
    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);
  } else from.setDate(from.getDate() - (period === 'last_30_days' ? 30 : 7));
  return [from, to];
}

export function createPBXReadServices(deps: PBXReadServiceDeps): PBXReadServices {
  return {
    activeCalls: async () => {
      const result = await deps.runFixedDiagnostic('channels');
      const rows = result.success ? deps.parseChannels(result.message) : [];
      return { items: rows.slice(0, 100).map(row => ({
        direction: /from-trunk|ext-did/i.test(row.context) ? 'inbound' : /from-internal/i.test(row.context) ? 'outbound' : 'internal',
        state: String(row.state ?? ''), extension: safeExtension(row.exten), remotePartyMasked: maskPhone(row.callerId),
        startedAt: null, durationSeconds: String(row.duration ?? '0').split(':').reduce((total, part) => total * 60 + Number(part), 0),
        queue: /queue/i.test(row.application) ? safeExtension(row.exten) || null : null
      })) };
    },
    sipRegistrations: async () => {
      const [pjsip, sip] = await Promise.all([deps.runFixedDiagnostic('pjsip_contacts'), deps.runFixedDiagnostic('sip_peers')]);
      const rows = [...deps.parsePjsip(pjsip.message).values(), ...deps.parseSipPeers(sip.message).values()];
      return { items: rows.slice(0, 200).map(row => ({
        technology: String(row.tech ?? ''), endpoint: safeExtension(row.ext) || String(row.ext ?? '').slice(0, 64),
        state: String(row.status ?? 'unknown'),
        contactMasked: row.ip ? maskSipContact(`sip:${row.ext}@${row.ip}:${row.port || 5060}`) : null,
        lastSeen: null, latencyMs: Number(row.rtt) || null
      })) };
    },
    trunksStatus: async () => {
      const [pjsip, sip] = await Promise.all([deps.runFixedDiagnostic('pjsip_contacts'), deps.runFixedDiagnostic('sip_registry')]);
      const items = [...deps.parsePjsip(pjsip.message).values()].filter(row => row.deviceRole === 'trunk').map(row => ({
        trunkKey: String(row.ext ?? '').slice(0, 64), technology: 'PJSIP', registrationState: String(row.status ?? 'unknown'),
        reachable: row.status === 'Online', latencyMs: Number(row.rtt) || null,
        safeSummary: `${String(row.ext ?? '').slice(0, 64)}: ${String(row.status ?? 'unknown').slice(0, 64)}`
      }));
      for (const line of sip.message.split(/\r?\n/)) {
        if (!/Registered|Request Sent|Rejected/i.test(line)) continue;
        const trunkKey = line.trim().split(/\s+/)[0].slice(0, 64);
        const registered = /Registered/i.test(line);
        items.push({ trunkKey, technology: 'SIP', registrationState: registered ? 'Registered' : 'Unavailable', reachable: registered,
          latencyMs: null, safeSummary: `${trunkKey}: ${registered ? 'Registered' : 'Unavailable'}` });
      }
      return { items: items.slice(0, 100) };
    },
    extensionsStatus: async input => {
      const query = safeFilter(input.query).toLowerCase();
      const rows = (await deps.readAuthoritativeExtensions())
        .filter(row => row.deviceRole !== 'trunk')
        .filter(row => !query || `${row.ext ?? ''} ${row.name ?? ''}`.toLowerCase().includes(query))
        .slice(0, boundedLimit(input.limit));
      return { items: rows.map(row => ({ extension: safeExtension(row.ext), displayName: String(row.name ?? ''),
        state: String(row.status ?? 'unknown'), registered: /online|registered|available/i.test(String(row.status ?? '')),
        deviceType: row.tech ? String(row.tech) : null })) };
    },
    missedCalls: async input => {
      const from = new Date(Date.now() - Math.min(Number(input.periodHours) || 24, 720) * 3_600_000);
      const params: unknown[] = [sqlDate(from)];
      let where = "calldate >= ? AND disposition IN ('NO ANSWER','BUSY','FAILED')";
      if (input.extension) { where += ' AND dst = ?'; params.push(safeExtension(input.extension)); }
      params.push(boundedLimit(input.limit));
      const rows = await deps.queryCdr(`SELECT calldate,src,dst,disposition FROM cdr WHERE ${where} ORDER BY calldate DESC LIMIT ?`, params);
      return { items: rows.map(row => ({ occurredAt: row.calldate, callerMasked: maskPhone(row.src), calledExtension: safeExtension(row.dst),
        status: String(row.disposition), callbackStatus: null })) };
    },
    callStatistics: async input => {
      const [from, to] = periodRange(input.period);
      const params: unknown[] = [sqlDate(from), sqlDate(to)];
      let where = 'calldate >= ? AND calldate < ?';
      if (input.extension) { const extension = safeExtension(input.extension); where += ' AND (src = ? OR dst = ?)'; params.push(extension, extension); }
      if (input.queue) { const queue = safeFilter(input.queue, 64); where += ' AND (dcontext LIKE ? OR lastdata LIKE ?)'; params.push(`%${queue}%`, `%${queue}%`); }
      const row = (await deps.queryCdr(`SELECT COUNT(*) total,SUM(disposition='ANSWERED') answered,SUM(disposition<>'ANSWERED') missed,AVG(duration) avgDuration FROM cdr WHERE ${where}`, params))[0] ?? {};
      return { total: Number(row.total || 0), answered: Number(row.answered || 0), missed: Number(row.missed || 0),
        averageDurationSeconds: Math.round(Number(row.avgDuration || 0)), averageWaitSeconds: null };
    },
    searchContacts: async input => {
      const query = safeFilter(input.query).toLowerCase();
      const rows = (await deps.readDirectory()).filter(row => `${row.name ?? ''} ${row.company ?? ''} ${row.number ?? ''}`.toLowerCase().includes(query)).slice(0, boundedLimit(input.limit, 50));
      return { items: rows.map(row => ({ contactId: String(row.id), name: String(row.name ?? ''), company: row.company || null,
        type: String(row.type || 'contact'), phonesMasked: [maskPhone(row.number)], owner: row.owner || null, isSpam: Boolean(row.isSpam) })) };
    },
    searchHistory: async input => {
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (input.query) { const query = `%${safeFilter(input.query)}%`; conditions.push('(src LIKE ? OR dst LIKE ? OR clid LIKE ?)'); params.push(query, query, query); }
      if (input.extension) { const extension = safeExtension(input.extension); conditions.push('(src = ? OR dst = ?)'); params.push(extension, extension); }
      if (input.direction === 'inbound') conditions.push("dcontext REGEXP 'from-trunk|ext-did'");
      if (input.direction === 'outbound') conditions.push("dcontext = 'from-internal'");
      if (input.direction === 'internal') conditions.push("dcontext NOT REGEXP 'from-trunk|ext-did' AND dcontext <> 'from-internal'");
      if (input.dateFrom) { conditions.push('calldate >= ?'); params.push(safeFilter(input.dateFrom, 32)); }
      if (input.dateTo) { conditions.push('calldate <= ?'); params.push(safeFilter(input.dateTo, 32)); }
      params.push(boundedLimit(input.limit));
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await deps.queryCdr(`SELECT uniqueid,calldate,src,dst,dcontext,disposition,duration,linkedid FROM cdr ${where} ORDER BY calldate DESC LIMIT ?`, params);
      return { items: rows.map(row => ({ callId: String(row.uniqueid), occurredAt: row.calldate,
        direction: /from-trunk|ext-did/i.test(row.dcontext) ? 'inbound' : row.dcontext === 'from-internal' ? 'outbound' : 'internal',
        sourceMasked: maskPhone(row.src), destinationMasked: maskPhone(row.dst), disposition: String(row.disposition), durationSeconds: Number(row.duration || 0),
        linkedIdHash: row.linkedid ? crypto.createHash('sha256').update(String(row.linkedid)).digest('hex').slice(0, 16) : null })) };
    }
  };
}
