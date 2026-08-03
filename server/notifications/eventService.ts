import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { evaluateDelivery } from './ruleEngine.js';
import type { NotificationEventInput, NotificationGlobalSettings, NotificationRule, NotificationSeverity } from './types.js';
import { applyObservation } from './stateMachine.js';
import { NOTIFICATION_EVENT_CATALOG } from './catalog.js';

const bool = (value: any) => value === true || value === 1 || value === '1';
const json = <T>(value: any, fallback: T): T => { try { return JSON.parse(String(value || '')) as T; } catch { return fallback; } };
const sqlDate = (value: Date) => value.toISOString().slice(0, 19).replace('T', ' ');

export class NotificationEventService {
  async globalSettings(): Promise<NotificationGlobalSettings> {
    const row = (await queryPBXPulsDb('SELECT * FROM notification_settings WHERE id=1 LIMIT 1'))[0] || {};
    return { enabled:bool(row.enabled), objectName:String(row.object_name || 'PBXPuls'), minimumSeverity:(row.minimum_severity || 'warning') as NotificationSeverity,
      notifyOnRecovery:bool(row.notify_on_recovery), defaultCooldownSeconds:Number(row.default_cooldown_seconds || 3600),
      categories:json(row.categories_json, { balance:true,calls:true,telephony:true,monitoring:true,system:true,security:false }) };
  }
  async rules(): Promise<NotificationRule[]> {
    const rows = await queryPBXPulsDb('SELECT * FROM notification_rules ORDER BY category,event_type');
    return rows.map((row:any) => ({ eventType:row.event_type,category:row.category,enabled:bool(row.enabled),severity:row.severity,
      cooldownSeconds:Number(row.cooldown_seconds || 0),notifyOnRecovery:bool(row.notify_on_recovery),parameters:json(row.parameters_json,{}) }));
  }
  async saveGlobal(input:any) {
    const current=await this.globalSettings(); const severities=['info','warning','error','critical'];
    const value={enabled:input?.enabled===true,objectName:String(input?.objectName??current.objectName).trim().slice(0,191)||'PBXPuls',
      minimumSeverity:severities.includes(input?.minimumSeverity)?input.minimumSeverity:current.minimumSeverity,notifyOnRecovery:input?.notifyOnRecovery!==false,
      defaultCooldownSeconds:Math.max(0,Math.min(604800,Number(input?.defaultCooldownSeconds??current.defaultCooldownSeconds)||3600)),categories:{...current.categories,...(input?.categories||{})}};
    await queryPBXPulsDb('UPDATE notification_settings SET enabled=?,object_name=?,minimum_severity=?,notify_on_recovery=?,default_cooldown_seconds=?,categories_json=?,updated_at=UTC_TIMESTAMP() WHERE id=1',
      [value.enabled?1:0,value.objectName,value.minimumSeverity,value.notifyOnRecovery?1:0,value.defaultCooldownSeconds,JSON.stringify(value.categories)]); return value;
  }
  async saveRules(items:any[]) {
    const existing=new Map((await this.rules()).map(rule=>[rule.eventType,rule]));
    for(const item of Array.isArray(items)?items:[]){const old=existing.get(String(item?.eventType||''));if(!old)continue;const parameters={...old.parameters,...(item?.parameters||{})};
      await queryPBXPulsDb('UPDATE notification_rules SET enabled=?,cooldown_seconds=?,notify_on_recovery=?,parameters_json=?,updated_at=UTC_TIMESTAMP() WHERE event_type=?',
        [item.enabled===true?1:0,Math.max(0,Math.min(604800,Number(item.cooldownSeconds??old.cooldownSeconds)||0)),item.notifyOnRecovery!==false?1:0,JSON.stringify(parameters),old.eventType]);}
    return this.rules();
  }
  async observe(event:NotificationEventInput, options:{problem:boolean;consecutiveFailures?:number}):Promise<number|null>{
    const state=(await queryPBXPulsDb('SELECT * FROM notification_event_state WHERE dedupe_key=? LIMIT 1',[event.dedupeKey]))[0];
    const previous=String(state?.current_state||'normal') as any,transition=applyObservation({currentState:previous,consecutiveFailures:Number(state?.consecutive_failures||0),problem:options.problem,requiredFailures:Number(options.consecutiveFailures||1)}),failures=transition.failures;
    if(!transition.emit){await this.writeState(event.dedupeKey,transition.nextState,failures,options.problem?(state?.problem_started_at||sqlDate(event.occurredAt)):null,null,event.metadata);return null;}
    const next=transition.nextState;
    const recoveryType=NOTIFICATION_EVENT_CATALOG.find(item=>item.eventType===event.eventType)?.recoveryType;
    const normalized={...event,eventType:options.problem?event.eventType:(recoveryType||event.eventType),status:options.problem?'active':'resolved'} as NotificationEventInput;
    const eventId=await this.createEvent(normalized,state,event.eventType);
    await this.writeState(event.dedupeKey,next,options.problem?failures:0,options.problem?(state?.problem_started_at||sqlDate(event.occurredAt)):null,options.problem?null:sqlDate(event.occurredAt),event.metadata);
    return eventId;
  }
  async emit(event:NotificationEventInput):Promise<number>{return this.createEvent(event,null)}
  private async writeState(key:string,state:string,failures:number,started:any,recovered:any,metadata:any){await queryPBXPulsDb(`INSERT INTO notification_event_state(dedupe_key,current_state,problem_started_at,recovered_at,consecutive_failures,metadata_json,updated_at)VALUES(?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE current_state=VALUES(current_state),problem_started_at=VALUES(problem_started_at),recovered_at=VALUES(recovered_at),consecutive_failures=VALUES(consecutive_failures),metadata_json=VALUES(metadata_json),updated_at=UTC_TIMESTAMP()`,[key,state,started,recovered,failures,JSON.stringify(metadata||{})])}
  private async createEvent(event:NotificationEventInput,state:any,ruleEventType=event.eventType):Promise<number>{
    const result:any=await queryPBXPulsDb(`INSERT INTO notification_events(event_type,category,severity,title,message,source,entity_type,entity_id,dedupe_key,status,metadata_json,occurred_at,resolved_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [event.eventType,event.category,event.severity,event.title.slice(0,191),event.message.slice(0,4000),event.source,event.entityType||null,event.entityId||null,event.dedupeKey,event.status,JSON.stringify(event.metadata||{}),sqlDate(event.occurredAt),event.status==='resolved'?sqlDate(event.occurredAt):null]);
    const eventId=Number(result.insertId); const global=await this.globalSettings(),rule=(await this.rules()).find(item=>item.eventType===ruleEventType)||null;
    const channel=(await queryPBXPulsDb("SELECT enabled FROM notification_channels WHERE channel='telegram' LIMIT 1"))[0]||{};
    const duplicateRows=await queryPBXPulsDb(`SELECT id FROM notification_events WHERE id<>? AND event_type=? AND dedupe_key=? AND status=? AND occurred_at=? LIMIT 1`,[eventId,event.eventType,event.dedupeKey,event.status,sqlDate(event.occurredAt)]);
    const decision=evaluateDelivery(event,{global,channelEnabled:bool(channel.enabled),categoryEnabled:global.categories[event.category]!==false,rule,lastNotifiedAt:state?.last_notified_at?new Date(state.last_notified_at):null,duplicate:duplicateRows.length>0,now:new Date()});
    await queryPBXPulsDb(`INSERT INTO notification_deliveries(event_id,channel_id,channel,event_key,status,attempt_count,last_error,next_attempt_at,payload_json,attempted_at,created_at)VALUES(?,'telegram','telegram',?,?,0,?,IF(?='pending',UTC_TIMESTAMP(),NULL),?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[eventId,event.dedupeKey,decision.status,decision.status==='pending'?null:decision.reason,decision.status,JSON.stringify({reason:decision.reason})]);
    return eventId;
  }
}
