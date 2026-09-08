import fetch, {type RequestInit, type Response} from 'node-fetch';
export const MCN_BALANCE_URL='https://integration.mcn.ru/api-proxy/protected/api/internal/account/balance-full/';
const AUTH_URL='https://base.mcn.ru/api/protected/api/auth/info';
export class McnError extends Error { constructor(public readonly code:string){super(code)} }
export function mcnAccountId(value:unknown):number|null {
  if(value===undefined||value===null||value==='')return null;
  if(!/^\d{1,12}$/.test(String(value)))throw new McnError('invalid_account_id');
  const id=Number(value);if(!Number.isSafeInteger(id)||id<=0)throw new McnError('invalid_account_id');return id;
}
const amount=(v:unknown):number=>{if(!['string','number'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v)))throw new McnError('invalid_balance_response');return Number(v)};
export function normalizeMcnBalance(payload:any,accountId:number){
  if(payload?.status!=='OK')throw new McnError('provider_rejected_request');
  const r=payload.result;
  if(!r||mcnAccountId(r.id)!==accountId)throw new McnError('account_mismatch');
  if(typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency))throw new McnError('invalid_balance_response');
  return {accountId,balance:amount(r.balance),creditLimit:r.credit==null?null:amount(r.credit),currency:r.currency};
}
export class McnTelecomClient {
  constructor(private readonly token:string,private readonly fetchImpl:(url:string,init?:RequestInit)=>Promise<Response>=fetch){}
  private async request(url:string,body?:object){
    if(!this.token||this.token.length>4096||/[\r\n]/.test(this.token))throw new McnError('credentials_missing');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await this.fetchImpl(url,{method:body?'POST':'GET',redirect:'manual',signal:controller.signal,size:1024*1024,
        headers:{Authorization:`Bearer ${this.token}`,Accept:'application/json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      if(response.status>=300&&response.status<400)throw new McnError('redirect_blocked');
      if(!response.ok)throw new McnError(`http_${response.status}`);
      const data=await response.json().catch(()=>{throw new McnError('invalid_json')});
      if(data?.ok===false)throw new McnError('provider_rejected_request');
      return data;
    }catch(e:any){if(e instanceof McnError)throw e;throw new McnError(e?.name==='AbortError'?'timeout':'network_error')}
    finally{clearTimeout(timer)}
  }
  async getBalance(configuredAccountId?:number|null){
    let accountId=mcnAccountId(configuredAccountId);
    if(!accountId){const auth=await this.request(AUTH_URL);if(auth?.ok!==true)throw new McnError('authorization_failed');accountId=mcnAccountId(auth.result?.currentAccount?.accountId);}
    if(!accountId)throw new McnError('account_missing');
    return normalizeMcnBalance(await this.request(MCN_BALANCE_URL,{account_id:accountId}),accountId);
  }
}
export function safeMcnError(error:unknown){
  const code=error instanceof McnError?error.code:'mcn_storage_error';
  const labels:Record<string,string>={credentials_missing:'Токен MCN не настроен',invalid_account_id:'Укажите числовой номер лицевого счёта',
    http_401:'MCN отклонил авторизацию',http_403:'Нет доступа к API MCN или лицевому счёту',http_429:'Достигнут лимит запросов MCN',
    timeout:'Истекло время ожидания MCN',network_error:'Сетевая ошибка подключения к MCN',provider_disabled:'Подключение MCN выключено',
    account_mismatch:'MCN вернул другой лицевой счёт',invalid_balance_response:'MCN вернул некорректный баланс',settings_changed:'Настройки изменились во время запроса. Обновите баланс ещё раз'};
  return{safeErrorCode:code,safeMessage:labels[code]||'Не удалось получить данные MCN Telecom'};
}
