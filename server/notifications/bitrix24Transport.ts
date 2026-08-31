import fetch, { type RequestInit, type Response } from 'node-fetch';
import { assertDnsSafe } from '../ai-platform/integrations/integrationSecurity.js';

export type Bitrix24Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const validBitrix24Dialog = (value:string) => /^(?:\d+|chat\d+)$/.test(String(value || '').trim());

export function parseBitrix24Webhook(value:string):URL {
  let url:URL;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('invalid_bitrix24_webhook'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/rest\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error('invalid_bitrix24_webhook');
  return url;
}

export class Bitrix24Transport {
  constructor(private readonly fetchImpl:Bitrix24Fetch = fetch as Bitrix24Fetch,private readonly dnsCheck:(url:URL)=>Promise<unknown> = assertDnsSafe) {}

  private async call(webhook:string,method:string,payload:Record<string,unknown>):Promise<any> {
    const base=parseBitrix24Webhook(webhook);
    try { await this.dnsCheck(base); } catch { throw new Error('invalid_bitrix24_webhook'); }
    const url=new URL(`${method}.json`,base.toString().endsWith('/')?base.toString():`${base.toString()}/`);
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10_000);
    try {
      const response=await this.fetchImpl(url.toString(),{method:'POST',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json'},signal:controller.signal as any,body:JSON.stringify(payload)});
      const raw=(await response.text()).slice(0,8192);let body:any={};try{body=JSON.parse(raw)}catch{}
      if(!response.ok||body?.error)throw new Error(response.status===401||body?.error==='NO_AUTH_FOUND'?'bitrix24_auth_failed':response.status===429?'bitrix24_rate_limited':'bitrix24_rejected');
      return body?.result;
    } catch(error:any) {
      if(error?.name==='AbortError')throw new Error('bitrix24_timeout');
      if(['bitrix24_auth_failed','bitrix24_rate_limited','bitrix24_rejected'].includes(String(error?.message)))throw error;
      throw new Error('bitrix24_network_error');
    } finally { clearTimeout(timeout); }
  }

  async check(webhook:string):Promise<{id:string;name:string}> { const result=await this.call(webhook,'profile',{});return{id:String(result?.ID||result?.id||''),name:[result?.NAME||result?.name,result?.LAST_NAME||result?.lastName].filter(Boolean).join(' ').trim()}; }
  async send(webhook:string,dialogId:string,text:string):Promise<void> { if(!validBitrix24Dialog(dialogId))throw new Error('invalid_bitrix24_dialog');await this.call(webhook,'im.message.add',{DIALOG_ID:dialogId,MESSAGE:text.slice(0,4000),URL_PREVIEW:'N'}); }
}
