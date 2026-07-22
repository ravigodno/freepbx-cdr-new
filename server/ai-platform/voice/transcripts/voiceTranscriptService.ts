import crypto from "node:crypto";
import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import { redactAiPlatformText, redactAiPlatformValue } from "../../core/redaction.js";
import type { RealtimeTranscriptKind } from "../providers/realtimeVoiceTypes.js";

type Speaker = "caller" | "ai" | "human_agent" | "system";
type LiveHandler = (event: unknown) => void;
const eventRef = (value?: string) =>
  value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 16) : null;

export class VoiceTranscriptService {
  private active = new Map<string, { id: number; sequence: number }>();
  private subscribers = new Map<number, Set<LiveHandler>>();
  constructor(private store: AiPlatformStore) {}

  private async enabled() {
    const rows = await this.store.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.voice_transcripts_save','ai.voice_transcripts_save_partial','ai.voice_transcripts_save_ai','ai.voice_transcripts_store_generated','ai.voice_transcripts_retention_days')");
    return new Map(rows.map((row: any) => [String(row.setting_key), String(row.setting_value)]));
  }
  private key(realtimeSessionId: number, speaker: Speaker) { return `${realtimeSessionId}:${speaker}`; }
  private emit(voiceSessionId: number, event: unknown) {
    for (const handler of this.subscribers.get(voiceSessionId) || []) handler(redactAiPlatformValue(event).value);
  }
  subscribe(voiceSessionId: number, handler: LiveHandler) {
    const handlers = this.subscribers.get(voiceSessionId) || new Set<LiveHandler>();
    handlers.add(handler); this.subscribers.set(voiceSessionId, handlers);
    return () => { handlers.delete(handler); if (!handlers.size) this.subscribers.delete(voiceSessionId); };
  }
  async transcript(input: { tenantId:number;voiceSessionId:number;mediaSessionId:number;realtimeSessionId:number;bindingId:number|null;agentId:number;agentVersionId:number;kind:RealtimeTranscriptKind;text:string;eventId?:string;confidence?:number;timestamp?:number }) {
    const settings = await this.enabled(), speaker: Speaker = input.kind.startsWith("input") ? "caller" : "ai",
      generated=input.kind.includes("generated"), isFinal = input.kind.endsWith("final"), text = redactAiPlatformText(input.text).slice(0, 4000), save = settings.get("ai.voice_transcripts_save") === "true" && Number(settings.get("ai.voice_transcripts_retention_days") || 30) !== 0;
    if(generated&&settings.get("ai.voice_transcripts_store_generated")!=="true"){this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal,generated:true});return;}
    if (speaker === "ai" && settings.get("ai.voice_transcripts_save_ai") === "false") return;
    if (!isFinal && settings.get("ai.voice_transcripts_save_partial") === "false") { this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal:false}); return; }
    if (!save) { this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal}); return; }
    const key = this.key(input.realtimeSessionId, speaker), current = this.active.get(key), now = new Date(input.timestamp || Date.now());
    if (current) {
      await this.store.query(`UPDATE ai_voice_transcript_utterances SET text_safe=?,generated_text_safe=IF(?, ?,generated_text_safe),spoken_text_safe=IF(?,spoken_text_safe,?),is_final=?,ended_at=?,confidence=COALESCE(?,confidence),provider_event_ref=COALESCE(?,provider_event_ref),updated_at=NOW() WHERE tenant_id=? AND id=?`,[text,generated?1:0,text,generated?1:0,text,isFinal?1:0,isFinal?now:null,Number.isFinite(input.confidence)?input.confidence:null,eventRef(input.eventId),input.tenantId,current.id]);
      if (isFinal) this.active.delete(key);
    } else {
      const rows=await this.store.query('SELECT COALESCE(MAX(sequence_no),0)+1 sequence_no FROM ai_voice_transcript_utterances WHERE tenant_id=? AND realtime_session_id=?',[input.tenantId,input.realtimeSessionId]),sequence=Number(rows[0]?.sequence_no||1),result:any=await this.store.query(`INSERT INTO ai_voice_transcript_utterances(tenant_id,voice_session_id,media_session_id,realtime_session_id,binding_id,agent_id,agent_version_id,speaker,sequence_no,started_at,ended_at,text_safe,generated_text_safe,spoken_text_safe,is_final,confidence,provider_event_ref)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[input.tenantId,input.voiceSessionId,input.mediaSessionId,input.realtimeSessionId,input.bindingId,input.agentId,input.agentVersionId,speaker,sequence,now,isFinal?now:null,text,generated?text:null,generated?null:text,isFinal?1:0,Number.isFinite(input.confidence)?input.confidence:null,eventRef(input.eventId)]);
      if (!isFinal) this.active.set(key,{id:Number(result.insertId),sequence});
    }
    this.emit(input.voiceSessionId,{type:"transcript",speaker,text,isFinal,confidence:Number.isFinite(input.confidence)?input.confidence:null});
  }
  async marker(input:{tenantId:number;voiceSessionId:number;mediaSessionId:number;realtimeSessionId:number;bindingId:number|null;agentId:number;agentVersionId:number;markerType:string;text?:string}) {
    const rows=await this.store.query('SELECT COALESCE(MAX(sequence_no),0)+1 sequence_no FROM ai_voice_transcript_utterances WHERE tenant_id=? AND realtime_session_id=?',[input.tenantId,input.realtimeSessionId]);
    await this.store.query(`INSERT INTO ai_voice_transcript_utterances(tenant_id,voice_session_id,media_session_id,realtime_session_id,binding_id,agent_id,agent_version_id,speaker,sequence_no,started_at,ended_at,text_safe,is_final,marker_type)VALUES(?,?,?,?,?,?,?,?,?,NOW(),NOW(),?,1,?)`,[input.tenantId,input.voiceSessionId,input.mediaSessionId,input.realtimeSessionId,input.bindingId,input.agentId,input.agentVersionId,'system',Number(rows[0]?.sequence_no||1),redactAiPlatformText(input.text||input.markerType),input.markerType]);
    this.emit(input.voiceSessionId,{type:"marker",markerType:input.markerType,text:redactAiPlatformText(input.text||'')});
  }
  async interrupt(tenantId:number,realtimeSessionId:number,voiceSessionId:number) {
    await this.store.query("UPDATE ai_voice_transcript_utterances SET interrupted=1,ended_at=COALESCE(ended_at,NOW()),incomplete=IF(is_final=0,1,incomplete),updated_at=NOW() WHERE tenant_id=? AND realtime_session_id=? AND speaker='ai' ORDER BY sequence_no DESC LIMIT 1",[tenantId,realtimeSessionId]);
    this.active.delete(this.key(realtimeSessionId,"ai")); this.emit(voiceSessionId,{type:"interrupted",speaker:"ai"});
  }
  async complete(tenantId:number,realtimeSessionId:number,voiceSessionId:number) {
    await this.store.query('UPDATE ai_voice_transcript_utterances SET incomplete=1,ended_at=COALESCE(ended_at,NOW()),updated_at=NOW() WHERE tenant_id=? AND realtime_session_id=? AND is_final=0',[tenantId,realtimeSessionId]);
    this.active.delete(this.key(realtimeSessionId,"caller")); this.active.delete(this.key(realtimeSessionId,"ai")); this.emit(voiceSessionId,{type:"completed"});
  }
  async usage(tenantId:number,voiceSessionId:number,usage:unknown) {
    const safe=redactAiPlatformValue({...((usage&&typeof usage==='object')?usage:{}),estimated_cost:null,currency:null,pricing_snapshot_version:null,transcription_model:'gpt-4o-transcribe'}).value;
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
