import crypto from 'node:crypto';
import {queryPBXPulsDb,withPBXPulsTransaction} from '../pbxpulsDb.js';
import {NotificationConfigCrypto} from '../notifications/configCrypto.js';
import {McnTelecomClient,McnError,mcnAccountId,safeMcnError} from './providers/mcnTelecom.js';
export const MCN_SOURCE_ID='mcn_telecom';
export const MCN_SOURCE_SEED="INSERT IGNORE INTO balance_sources(id,provider,display_name,enabled,config_json,sync_interval_minutes,status) VALUES('mcn_telecom','mcn_telecom','MCN Telecom',0,'{}',15,'disabled')";
type Query=(sql:string,params?:any[])=>Promise<any[]>;
type Transaction=<T>(work:(query:Query)=>Promise<T>)=>Promise<T>;
export class McnTelecomService {
  private cipher:NotificationConfigCrypto;
  private timer:ReturnType<typeof setInterval>|null=null;
  private pending:Promise<any>|null=null;
  constructor(secret:string,private query:Query=queryPBXPulsDb,
    private transaction:Transaction=work=>withPBXPulsTransaction(async c=>work(async(sql,p=[])=>{const [rows]=await c.execute(sql,p);return rows as any})),
    private client=(token:string)=>new McnTelecomClient(token)) {this.cipher=new NotificationConfigCrypto(`balance:mcn:${secret}`)}
  private async load(query=this.query,lock=false){
    const rows=await query(`SELECT s.*,c.access_token_encrypted FROM balance_sources s LEFT JOIN balance_source_credentials c ON c.source_id=s.id WHERE s.id='mcn_telecom'${lock?' FOR UPDATE':''}`);
    const row=rows[0]||{},config=JSON.parse(row.config_json||'{}');
    return{row,config,token:String(this.cipher.decrypt(row.access_token_encrypted).token||'')};
  }
  async settings(){const {row,config,token}=await this.load();return {enabled:!!row.enabled,accountId:config.accountId||null,hasToken:!!token,syncIntervalMinutes:row.sync_interval_minutes||15};}
  async save(input:any){
    const accountId=mcnAccountId(input.accountId),interval=Number(input.syncIntervalMinutes??15);
    if(!Number.isInteger(interval)||interval<5||interval>1440||typeof input.enabled!=='boolean')throw new McnError('invalid_settings');
    if(input.token!==undefined&&typeof input.token!=='string')throw new McnError('invalid_settings');
    const supplied=String(input.token||'').trim();if(supplied.length>4096||/[\r\n]/.test(supplied))throw new McnError('invalid_settings');
    await this.transaction(async query=>{
      await query(MCN_SOURCE_SEED);const current=await this.load(query,true);
      const token=input.clearToken===true?'':supplied||current.token;
      if(input.enabled&&!token)throw new McnError('credentials_missing');
      const config={accountId,revision:crypto.randomBytes(12).toString('hex')};
      await query("UPDATE balance_sources SET enabled=?,config_json=?,sync_interval_minutes=?,status=?,safe_error_code=NULL,updated_at=NOW() WHERE id='mcn_telecom'",[input.enabled?1:0,JSON.stringify(config),interval,input.enabled?'pending':'disabled']);
      await query("INSERT INTO balance_source_credentials(source_id,access_token_encrypted,key_version,updated_at) VALUES('mcn_telecom',?,'v1',NOW()) ON DUPLICATE KEY UPDATE access_token_encrypted=VALUES(access_token_encrypted),updated_at=NOW()",[token?this.cipher.encrypt({token}):null]);
    });return this.settings();
  }
  async diagnose(){const {config,token}=await this.load();const started=Date.now();const result=await this.client(token).getBalance(config.accountId);return{...result,requestMs:Date.now()-started};}
  async sync(){if(this.pending)return this.pending;this.pending=this.syncOnce();try{return await this.pending}finally{this.pending=null}}
  private async syncOnce(){
    const {row,config,token}=await this.load();if(!row.enabled)throw new McnError('provider_disabled');
    try{
      const result=await this.client(token).getBalance(config.accountId);
      await this.transaction(async query=>{
        const current=await this.load(query,true);
        if(!current.row.enabled||current.config.revision!==config.revision)throw new McnError('settings_changed');
        const account=String(result.accountId),mask='*'.repeat(Math.max(1,account.length-3))+account.slice(-3);
        await query("INSERT INTO balance_snapshots(source_id,balance_amount,currency,credit_limit,account_number_masked,measured_at,source_type,raw_hash,metadata_json) VALUES('mcn_telecom',?,?,?,?,NOW(),'api',?,?)",[result.balance,result.currency,result.creditLimit,mask,crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex'),JSON.stringify({accountId:result.accountId,settingsRevision:config.revision})]);
        await query("UPDATE balance_sources SET status='success',safe_error_code=NULL,last_attempt_at=NOW(),last_success_at=NOW(),updated_at=NOW() WHERE id='mcn_telecom'");
      });return result;
    }catch(error){if(!(error instanceof McnError&&error.code==='settings_changed'))await this.query("UPDATE balance_sources SET status='error',safe_error_code=?,last_attempt_at=NOW(),updated_at=NOW() WHERE id='mcn_telecom' AND enabled=1 AND config_json=?",[safeMcnError(error).safeErrorCode,row.config_json]);throw error}
  }
  async source(){
    const {row,config,token}=await this.load();
    const snaps=await this.query("SELECT balance_amount,currency,credit_limit,account_number_masked,measured_at,metadata_json FROM balance_snapshots WHERE source_id='mcn_telecom' ORDER BY id DESC LIMIT 1");
    const s=snaps[0],meta=JSON.parse(s?.metadata_json||'{}'),current=!!s&&meta.settingsRevision===config.revision;
    return{id:MCN_SOURCE_ID,provider:MCN_SOURCE_ID,displayName:'MCN Telecom',enabled:!!row.enabled,configured:!!token,
      status:row.status||'disabled',safeErrorCode:row.safe_error_code||null,balance:current?Number(s.balance_amount):null,currency:current?s.currency:null,
      creditLimit:current&&s.credit_limit!==null?Number(s.credit_limit):null,accountNumberMasked:current?s.account_number_masked:null,
      measuredAt:current?s.measured_at:null,lastSuccessAt:row.last_success_at||null,syncIntervalMinutes:row.sync_interval_minutes||15,
      capabilities:{balance:true,usage:false,recordings:false}};
  }
  start(){if(this.timer)return;const tick=async()=>{try{const {row,token}=await this.load();if(row.enabled&&token&&(!row.last_attempt_at||Date.now()-new Date(row.last_attempt_at).getTime()>=Number(row.sync_interval_minutes)*60000))await this.sync()}catch{/* Status is stored; never log credentials or raw HTTP responses. */}};this.timer=setInterval(()=>void tick(),60000);this.timer.unref?.();void tick();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
