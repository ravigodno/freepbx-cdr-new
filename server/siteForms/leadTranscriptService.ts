import type { AiPlatformStore } from '../ai-platform/storage/aiPlatformStore.js';
import type { VoiceTranscriptService } from '../ai-platform/voice/transcripts/voiceTranscriptService.js';
import { AI_LEAD_INTEGRATION_ID } from './aiCallbackLeadService.js';
import { formatTranscriptPhones } from '../../shared/transcriptPhoneDisplay.js';

export async function readLeadTranscript(store: AiPlatformStore, transcripts: Pick<VoiceTranscriptService,'list'>, tenantId: number, leadId: number) {
  // Resolve the relationship server-side. Never accept a client-provided voice ID
  // or trust arbitrary website raw_payload_json to authorize access to a call.
  if(tenantId!==1)return {voiceSessionId:null,rows:[]};
  const rows=await store.query(`SELECT v.id,v.state,a.name agent_name FROM site_form_leads l
    JOIN ai_callback_requests c ON l.event_id=CONCAT('ai-callback:',c.tenant_id,':',c.id)
    JOIN ai_voice_sessions v ON v.id=c.voice_session_id AND v.tenant_id=c.tenant_id
    JOIN ai_agents a ON a.id=v.agent_id AND a.tenant_id=v.tenant_id
    WHERE l.id=? AND l.integration_id=? AND l.deleted_at IS NULL AND c.tenant_id=? LIMIT 1`,
    [leadId,AI_LEAD_INTEGRATION_ID,tenantId]);
  if(!rows[0])return {voiceSessionId:null,rows:[]};
  const voice=rows[0],turns=await transcripts.list(tenantId,Number(voice.id));
  return {voiceSessionId:Number(voice.id),agentName:voice.agent_name,
    active:!['completed','failed','cancelled'].includes(voice.state),
    rows:turns.filter((t:any)=>Number(t.isFinal)===1&&!Number(t.supersededByRetry)&&['caller','ai'].includes(t.speaker))
      .map((t:any,index:number,visible:any[])=>({id:t.id,speaker:t.speaker,text:formatTranscriptPhones(t.spokenText||t.providerAudioTranscript||t.text,
        index>0?String(visible[index-1].spokenText||visible[index-1].providerAudioTranscript||visible[index-1].text||''):''),
        startedAt:t.startedAt,interrupted:Boolean(t.interrupted),incomplete:Boolean(t.incomplete)}))};
}
