import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { NotificationConfigCrypto } from './configCrypto.js';
import { safeNotificationError } from './errors.js';
import { TelegramTransport } from './telegramTransport.js';

export class NotificationDispatcher {
  private timer: ReturnType<typeof setInterval> | null = null; private running=false;
  constructor(private readonly crypto:NotificationConfigCrypto,private readonly telegram=new TelegramTransport()){}
  start(){if(this.timer)return;setTimeout(()=>void this.run(),3000).unref?.();this.timer=setInterval(()=>void this.run(),15000);this.timer.unref?.()}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null}
  async run(){if(this.running)return;this.running=true;try{const rows=await queryPBXPulsDb(`SELECT d.id,d.event_id,d.attempt_count,e.title,e.message,e.status event_status,s.object_name,c.encrypted_config,c.destination FROM notification_deliveries d JOIN notification_events e ON e.id=d.event_id JOIN notification_channels c ON c.channel=COALESCE(d.channel_id,d.channel) JOIN notification_settings s ON s.id=1 WHERE d.status IN('pending','retry_scheduled') AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=UTC_TIMESTAMP()) AND d.attempt_count<3 ORDER BY d.id LIMIT 20`);for(const row of rows)await this.deliver(row)}catch{}finally{this.running=false}}
  private async deliver(row:any){const config=this.crypto.decrypt(row.encrypted_config),token=String(config.botToken||''),chatId=String(row.destination||'');const attempt=Number(row.attempt_count||0)+1;
    try{if(!token||!chatId)throw new Error('telegram_not_configured');const marker=row.event_status==='resolved'?'✅':'⚠️';await this.telegram.send(token,chatId,`${marker} ${row.object_name}\n${row.title}\n${row.message}`);await queryPBXPulsDb(`UPDATE notification_deliveries SET status='sent',attempt_count=?,last_error=NULL,sent_at=UTC_TIMESTAMP(),delivered_at=UTC_TIMESTAMP(),next_attempt_at=NULL WHERE id=?`,[attempt,row.id]);await queryPBXPulsDb(`UPDATE notification_channels SET last_success_at=UTC_TIMESTAMP(),last_error=NULL,updated_at=UTC_TIMESTAMP() WHERE channel='telegram'`);await queryPBXPulsDb(`UPDATE notification_event_state s JOIN notification_events e ON e.dedupe_key=s.dedupe_key SET s.last_notified_at=UTC_TIMESTAMP(),s.updated_at=UTC_TIMESTAMP() WHERE e.id=?`,[row.event_id]);}
    catch(error){const safe=safeNotificationError(error),terminal=attempt>=3;await queryPBXPulsDb(`UPDATE notification_deliveries SET status=?,attempt_count=?,last_error=?,safe_error_code=?,next_attempt_at=IF(?=1,NULL,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)) WHERE id=?`,[terminal?'failed':'retry_scheduled',attempt,safe.safeErrorCode,safe.safeErrorCode,terminal?1:0,Math.min(900,60*Math.pow(2,attempt-1)),row.id]).catch(()=>{});await queryPBXPulsDb(`UPDATE notification_channels SET last_error=?,updated_at=UTC_TIMESTAMP() WHERE channel='telegram'`,[safe.safeErrorCode]).catch(()=>{})}}
}
