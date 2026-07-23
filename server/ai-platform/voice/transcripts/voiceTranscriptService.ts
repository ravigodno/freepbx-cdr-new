import crypto from "node:crypto";
import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import { redactAiPlatformText, redactAiPlatformValue } from "../../core/redaction.js";
import type { RealtimeTranscriptKind } from "../providers/realtimeVoiceTypes.js";
import { estimateVoiceCost, projectSafeVoiceUsage } from "./voiceUsageProjection.js";

type Speaker = "caller" | "ai" | "human_agent" | "system";
type LiveHandler = (event: unknown) => void;
const eventRef = (value?: string) =>
  value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 16) : null;

export class VoiceTranscriptService {
  private active = new Map<string, { id: number; sequence: number }>();
  private queues = new Map<number, Promise<unknown>>();
  private subscribers = new Map<number, Set<LiveHandler>>();
  private analyzer:((input:{voiceSessionId:number;turns:Array<{id:number;speaker:string;text:string}>})=>Promise<any>)|null=null;
  constructor(private store: AiPlatformStore) {}

  private async enabled() {
    const rows = await this.store.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.voice_transcripts_save','ai.voice_transcripts_save_partial','ai.voice_transcripts_save_ai','ai.voice_transcripts_store_generated','ai.voice_transcripts_retention_days')");
    return new Map(rows.map((row: any) => [String(row.setting_key), String(row.setting_value)]));
  }
  private key(realtimeSessionId: number, speaker: Speaker, itemRef: string | null) {
    return `${realtimeSessionId}:${speaker}:${itemRef || "active"}`;
  }
  private emit(voiceSessionId: number, event: unknown) {
    for (const handler of this.subscribers.get(voiceSessionId) || []) handler(redactAiPlatformValue(event).value);
  }
  subscribe(voiceSessionId: number, handler: LiveHandler) {
    const handlers = this.subscribers.get(voiceSessionId) || new Set<LiveHandler>();
    handlers.add(handler); this.subscribers.set(voiceSessionId, handlers);
    return () => { handlers.delete(handler); if (!handlers.size) this.subscribers.delete(voiceSessionId); };
  }
  setAnalyzer(analyzer:(input:{voiceSessionId:number;turns:Array<{id:number;speaker:string;text:string}>})=>Promise<any>){this.analyzer=analyzer}
  transcript(input: { tenantId:number;voiceSessionId:number;mediaSessionId:number;realtimeSessionId:number;bindingId:number|null;agentId:number;agentVersionId:number;kind:RealtimeTranscriptKind;text:string;eventId?:string;itemId?:string;responseId?:string;confidence?:number;timestamp?:number }) {
    const previous=this.queues.get(input.realtimeSessionId)||Promise.resolve(),
      next=previous.catch(()=>{}).then(()=>this.saveTranscript(input));
    this.queues.set(input.realtimeSessionId,next);
    return next.finally(()=>{if(this.queues.get(input.realtimeSessionId)===next)this.queues.delete(input.realtimeSessionId)});
  }
  private async saveTranscript(input: { tenantId:number;voiceSessionId:number;mediaSessionId:number;realtimeSessionId:number;bindingId:number|null;agentId:number;agentVersionId:number;kind:RealtimeTranscriptKind;text:string;eventId?:string;itemId?:string;responseId?:string;confidence?:number;timestamp?:number }) {
    const settings = await this.enabled(), speaker: Speaker = input.kind.startsWith("input") ? "caller" : "ai",
      generated=input.kind.includes("generated"), isFinal = input.kind.endsWith("final"), spokenFinal=isFinal&&!generated,
      text = redactAiPlatformText(input.text).slice(0, 4000), save = settings.get("ai.voice_transcripts_save") === "true" && Number(settings.get("ai.voice_transcripts_retention_days") || 30) !== 0,
      itemRef=eventRef(input.itemId),responseRef=eventRef(input.responseId);
    if(generated&&settings.get("ai.voice_transcripts_store_generated")!=="true"){this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal,generated:true});return;}
    if (speaker === "ai" && settings.get("ai.voice_transcripts_save_ai") === "false") return;
    if (!isFinal && settings.get("ai.voice_transcripts_save_partial") === "false") { this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal:false}); return; }
    if (!save) { this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal}); return; }
    const key = this.key(input.realtimeSessionId, speaker,itemRef), current = this.active.get(key), now = new Date(input.timestamp || Date.now());
    if (current) {
      if(isFinal) {
        await this.store.query(`UPDATE ai_voice_transcript_utterances SET text_safe=IF(?,text_safe,?),generated_text_safe=IF(?,?,generated_text_safe),spoken_text_safe=IF(?,spoken_text_safe,?),final_text_safe=IF(?,final_text_safe,?),is_final=IF(?,is_final,1),ended_at=IF(?,ended_at,?),last_delta_at=?,confidence=COALESCE(?,confidence),provider_event_ref=COALESCE(?,provider_event_ref),updated_at=NOW() WHERE tenant_id=? AND id=?`,[generated?1:0,text,generated?1:0,text,generated?1:0,text,generated?1:0,text,generated?1:0,generated?1:0,now,now,Number.isFinite(input.confidence)?input.confidence:null,eventRef(input.eventId),input.tenantId,current.id]);
      } else {
        await this.store.query(`UPDATE ai_voice_transcript_utterances SET current_partial_text_safe=CONCAT(COALESCE(current_partial_text_safe,''),?),text_safe=CONCAT(COALESCE(text_safe,''),?),generated_text_safe=IF(?,CONCAT(COALESCE(generated_text_safe,''),?),generated_text_safe),spoken_text_safe=IF(?,spoken_text_safe,CONCAT(COALESCE(spoken_text_safe,''),?)),last_delta_at=?,confidence=COALESCE(?,confidence),updated_at=NOW() WHERE tenant_id=? AND id=?`,[text,text,generated?1:0,text,generated?1:0,text,now,Number.isFinite(input.confidence)?input.confidence:null,input.tenantId,current.id]);
      }
      if (spokenFinal) this.active.delete(key);
    } else {
      const rows=await this.store.query('SELECT COALESCE(MAX(sequence_no),0)+1 sequence_no FROM ai_voice_transcript_utterances WHERE tenant_id=? AND realtime_session_id=?',[input.tenantId,input.realtimeSessionId]),sequence=Number(rows[0]?.sequence_no||1),result:any=await this.store.query(`INSERT INTO ai_voice_transcript_utterances(tenant_id,voice_session_id,media_session_id,realtime_session_id,binding_id,agent_id,agent_version_id,speaker,sequence_no,started_at,ended_at,text_safe,generated_text_safe,spoken_text_safe,is_final,confidence,provider_event_ref)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[input.tenantId,input.voiceSessionId,input.mediaSessionId,input.realtimeSessionId,input.bindingId,input.agentId,input.agentVersionId,speaker,sequence,now,spokenFinal?now:null,text,generated?text:null,generated?null:text,spokenFinal?1:0,Number.isFinite(input.confidence)?input.confidence:null,eventRef(input.eventId)]);
      await this.store.query(`UPDATE ai_voice_transcript_utterances SET provider_item_ref=?,provider_response_ref=?,current_partial_text_safe=?,final_text_safe=?,last_delta_at=? WHERE tenant_id=? AND id=?`,[itemRef,responseRef,isFinal?null:text,spokenFinal?text:null,now,input.tenantId,Number(result.insertId)]);
      if (!spokenFinal) this.active.set(key,{id:Number(result.insertId),sequence});
    }
    this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal,confidence:Number.isFinite(input.confidence)?input.confidence:null});
  }
  async marker(input:{tenantId:number;voiceSessionId:number;mediaSessionId:number;realtimeSessionId:number;bindingId:number|null;agentId:number;agentVersionId:number;markerType:string;text?:string}) {
    const rows=await this.store.query('SELECT COALESCE(MAX(sequence_no),0)+1 sequence_no FROM ai_voice_transcript_utterances WHERE tenant_id=? AND realtime_session_id=?',[input.tenantId,input.realtimeSessionId]);
    await this.store.query(`INSERT INTO ai_voice_transcript_utterances(tenant_id,voice_session_id,media_session_id,realtime_session_id,binding_id,agent_id,agent_version_id,speaker,sequence_no,started_at,ended_at,text_safe,is_final,marker_type)VALUES(?,?,?,?,?,?,?,?,?,NOW(),NOW(),?,1,?)`,[input.tenantId,input.voiceSessionId,input.mediaSessionId,input.realtimeSessionId,input.bindingId,input.agentId,input.agentVersionId,'system',Number(rows[0]?.sequence_no||1),redactAiPlatformText(input.text||input.markerType),input.markerType]);
    this.emit(input.voiceSessionId,{type:"marker",markerType:input.markerType,text:redactAiPlatformText(input.text||'')});
  }
  async interrupt(tenantId:number,realtimeSessionId:number,voiceSessionId:number) {
    await this.store.query("UPDATE ai_voice_transcript_utterances SET interrupted=1,ended_at=COALESCE(last_delta_at,ended_at,NOW()),incomplete=IF(is_final=0,1,incomplete),updated_at=NOW() WHERE tenant_id=? AND realtime_session_id=? AND speaker='ai' ORDER BY sequence_no DESC LIMIT 1",[tenantId,realtimeSessionId]);
    for(const key of [...this.active.keys()])if(key.startsWith(`${realtimeSessionId}:ai:`))this.active.delete(key); this.emit(voiceSessionId,{type:"interrupted",speaker:"ai"});
  }
  async complete(tenantId:number,realtimeSessionId:number,voiceSessionId:number) {
    await this.store.query('UPDATE ai_voice_transcript_utterances SET incomplete=1,ended_at=COALESCE(last_delta_at,started_at),updated_at=NOW() WHERE tenant_id=? AND realtime_session_id=? AND is_final=0',[tenantId,realtimeSessionId]);
    for(const key of [...this.active.keys()])if(key.startsWith(`${realtimeSessionId}:`))this.active.delete(key); this.emit(voiceSessionId,{type:"completed"});this.scheduleAnalysis(tenantId,voiceSessionId);
  }
  private scheduleAnalysis(tenantId:number,voiceSessionId:number){
    const timer=setTimeout(async()=>{
      const setting=(await this.store.query("SELECT setting_value FROM settings WHERE setting_key='ai.voice_transcripts_post_call_summary' LIMIT 1"))[0];
      if(setting?.setting_value!=='true'||!this.analyzer)return;
      await this.store.query(`INSERT INTO ai_voice_call_insights(tenant_id,voice_session_id,analysis_status)VALUES(?,?,'pending') ON DUPLICATE KEY UPDATE analysis_status='pending',failure_code=NULL,updated_at=NOW()`,[tenantId,voiceSessionId]);
      for(let attempt=0;attempt<2;attempt++)try{
        const rows=await this.store.query("SELECT id,speaker,COALESCE(spoken_text_safe,text_safe,'') text FROM ai_voice_transcript_utterances WHERE tenant_id=? AND voice_session_id=? AND is_final=1 ORDER BY sequence_no",[tenantId,voiceSessionId]),
          turns=rows.map((row:any)=>({id:Number(row.id),speaker:String(row.speaker),text:redactAiPlatformText(String(row.text)).slice(0,2000)})),
          raw=await this.analyzer({voiceSessionId,turns}),value=raw&&typeof raw==='object'?raw:{},evidence=Array.isArray(value.evidence_turn_ids)?value.evidence_turn_ids.map(Number).filter((id:number)=>turns.some((turn:any)=>turn.id===id)).slice(0,50):[];
        await this.store.query(`UPDATE ai_voice_call_insights SET summary_safe=?,topic_safe=?,outcome_safe=?,next_action_safe=?,transferred=?,callback_requested=?,unresolved_issue=?,analysis_status='completed',failure_code=NULL,updated_at=NOW() WHERE tenant_id=? AND voice_session_id=?`,[
          redactAiPlatformText(String(value.summary||'')).slice(0,4000)||null,redactAiPlatformText(String(value.topic||'')).slice(0,255)||null,redactAiPlatformText(String(value.outcome||'')).slice(0,255)||null,redactAiPlatformText(String(value.next_action||'')).slice(0,4000)||null,value.transferred===true?1:0,value.callback_requested===true?1:0,value.unresolved_issue===true?1:0,tenantId,voiceSessionId,
        ]);
        await this.store.query("UPDATE ai_voice_sessions SET metadata_json=JSON_SET(COALESCE(metadata_json,'{}'),'$.postCallEvidenceTurnIds',?) WHERE tenant_id=? AND id=?",[JSON.stringify(evidence),tenantId,voiceSessionId]);
        return;
      }catch{if(attempt)await this.store.query("UPDATE ai_voice_call_insights SET analysis_status='failed',failure_code='post_call_analysis_failed',updated_at=NOW() WHERE tenant_id=? AND voice_session_id=?",[tenantId,voiceSessionId])}
    },0);timer.unref?.();
  }
  async usage(tenantId:number,voiceSessionId:number,usage:unknown) {
    const sessions=await this.store.query('SELECT input_audio_ms,output_audio_ms FROM ai_realtime_voice_sessions WHERE tenant_id=? AND voice_session_id=? ORDER BY id DESC LIMIT 1',[tenantId,voiceSessionId]),
      settings=await this.store.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.voice_pricing_snapshot_version','ai.voice_pricing_currency','ai.voice_pricing_rates_json')"),
      map=new Map(settings.map((row:any)=>[String(row.setting_key),String(row.setting_value)])),
      rates=(()=>{try{const parsed=JSON.parse(map.get('ai.voice_pricing_rates_json')||'{}'),model=process.env.PBXPULS_OPENAI_REALTIME_MODEL||'gpt-realtime-2.1',selected=parsed?.[`openai_realtime:${model}`]||parsed?.openai_realtime;return selected&&typeof selected==='object'?selected:{}}catch{return{}}})(),
      safe=estimateVoiceCost(projectSafeVoiceUsage(usage,{inputSeconds:Number(sessions[0]?.input_audio_ms||0)/1000,outputSeconds:Number(sessions[0]?.output_audio_ms||0)/1000}),map.get('ai.voice_pricing_snapshot_version')?{version:map.get('ai.voice_pricing_snapshot_version')!,currency:map.get('ai.voice_pricing_currency')||'USD',rates}:null);
    await this.store.query(`INSERT INTO ai_voice_call_insights(tenant_id,voice_session_id,analysis_status,usage_json)VALUES(?,?,'disabled',?) ON DUPLICATE KEY UPDATE usage_json=VALUES(usage_json),updated_at=NOW()`,[tenantId,voiceSessionId,JSON.stringify(safe)]);
  }
  async list(tenantId:number,voiceSessionId:number) {
    return this.store.query(`SELECT id,speaker,sequence_no sequence,started_at startedAt,ended_at endedAt,text_safe text,generated_text_safe generatedText,spoken_text_safe spokenText,is_final isFinal,interrupted,incomplete,confidence,provider_event_ref providerEventRef,marker_type markerType FROM ai_voice_transcript_utterances WHERE tenant_id=? AND voice_session_id=? ORDER BY sequence_no,id`,[tenantId,voiceSessionId]);
  }
  async cleanup(tenantId:number) {
    const rows=await this.store.query("SELECT setting_value FROM settings WHERE setting_key='ai.voice_transcripts_retention_days' LIMIT 1"),days=Number(rows[0]?.setting_value||30);
    if (days<=0) return {deleted:0,retentionDays:days};
    const result:any=await this.store.query('DELETE FROM ai_voice_transcript_utterances WHERE tenant_id=? AND created_at<DATE_SUB(NOW(),INTERVAL ? DAY)',[tenantId,days]);
    return {deleted:Number(result.affectedRows||0),retentionDays:days};
  }
}
