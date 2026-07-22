import crypto from 'crypto';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { insertId } from '../storage/aiPlatformStore.js';
import type { AiAuditService } from '../audit/aiAuditService.js';
import { normalizeVoiceEvent } from './voiceEventNormalizer.js';
import { VoiceRouteResolver } from './voiceRouteResolver.js';
import { VoiceAgentResolver } from './voiceAgentResolver.js';
import { enforceVoiceBindingPolicy } from './voiceSessionPolicy.js';
import { VoiceSessionService } from './voiceSessionService.js';
import { VoiceEncryptionService } from './voiceEncryption.js';
import { VoiceSessionRepository } from './voiceSessionRepository.js';
import type { VoiceGatewayMetrics } from './voiceGatewayTypes.js';

export class VoiceGatewayService {
  readonly sessions: VoiceSessionService;
  readonly metrics: VoiceGatewayMetrics = { normalizedEvents:0,ignoredEvents:0,sessionsCreated:0,failedSessions:0,stateTransitionErrors:0,reconnects:0,totalDurationMs:0,completedSessions:0 };
  private readonly routes:VoiceRouteResolver; private readonly agents:VoiceAgentResolver; private readonly repo:VoiceSessionRepository; private dedup=new Map<string,number>();
  constructor(private readonly store:AiPlatformStore,private readonly audit:AiAuditService){this.sessions=new VoiceSessionService(store,audit);this.routes=new VoiceRouteResolver(store);this.agents=new VoiceAgentResolver(store);this.repo=new VoiceSessionRepository(store)}
  async handleRawEvent(raw:any,options:{tenantId?:number;synthetic:boolean;bindingId?:number;traceId?:string}){
    const tenantId=options.tenantId||1,traceId=options.traceId||crypto.randomUUID(),event=normalizeVoiceEvent(tenantId,raw),key=`${tenantId}:${event.eventType}:${event.channelRefHash}:${event.timestamp}`,now=Date.now();this.metrics.normalizedEvents++;
    if(this.dedup.has(key))return{ignored:true,reason:'duplicate'};this.dedup.set(key,now);if(this.dedup.size>2000)for(const[k,v]of this.dedup)if(now-v>600000)this.dedup.delete(k);
    await this.audit.append({tenantId,traceId,actorType:'service',eventType:'voice_event_received',entityType:'voice_event',entityId:event.channelRefHash.slice(0,32),decision:'received',details:{eventType:event.eventType,channelRefHash:event.channelRefHash,bridgeRefHash:event.bridgeRefHash,synthetic:options.synthetic}});
    if(event.eventType==='StasisStart'){
      const existing=(await this.repo.findActiveByChannel(tenantId,event.channelRefHash))[0];if(existing){this.metrics.ignoredEvents++;await this.audit.append({tenantId,traceId,actorType:'service',eventType:'voice_event_ignored',entityType:'voice_session',entityId:String(existing.id),decision:'ignored',details:{reason:'active_session_exists'}});return{ignored:true,reason:'active_session_exists',session:await this.sessions.get(tenantId,Number(existing.id))}}
      const binding=await this.routes.resolve(tenantId,event,options.bindingId);if(!binding){this.metrics.ignoredEvents++;await this.audit.append({tenantId,traceId,actorType:'service',eventType:'voice_event_ignored',entityType:'voice_event',entityId:event.channelRefHash.slice(0,32),decision:'ignored',details:{reason:'route_not_matched'}});return{ignored:true,reason:'route_not_matched'}}
      enforceVoiceBindingPolicy(binding,options.synthetic);const agent=await this.agents.resolve(binding,options.synthetic);
      const conversation:any=await this.store.query(`INSERT INTO ai_conversations(tenant_id,agent_id,agent_version_id,channel,status,language,started_by,metadata_json)VALUES(?,?,?,'voice','active',?,'voice_gateway',?)`,[tenantId,agent.agentId,agent.agentVersionId,binding.language,JSON.stringify({synthetic:options.synthetic,externalCallIdHash:event.channelRefHash})]),conversationId=insertId(conversation);
      const session=await this.sessions.create({tenantId,traceId,conversationId,...agent,routeBindingId:binding.id,language:binding.language,synthetic:options.synthetic},event);
      await this.store.query(`INSERT INTO ai_conversation_messages(tenant_id,conversation_id,sequence_no,role,content,content_json)VALUES(?,?,1,'system','voice_session_started',?)`,[tenantId,conversationId,JSON.stringify({voiceSessionId:session.id})]);await this.sessions.transition(tenantId,session.id,'entering_stasis',traceId);const active=await this.sessions.transition(tenantId,session.id,'active',traceId);this.metrics.sessionsCreated++;return{ignored:false,session:active};
    }
    const row=(await this.repo.findActiveByChannel(tenantId,event.channelRefHash))[0];if(!row){this.metrics.ignoredEvents++;return{ignored:true,reason:'session_not_found'}}if(event.eventType==='StasisEnd'||event.eventType==='ChannelDestroyed')return this.complete(tenantId,Number(row.id),traceId,Number(row.conversation_id));
    const encryption=new VoiceEncryptionService(),encBridge=event.trustedBridgeRef&&encryption.ready()?encryption.encrypt(event.trustedBridgeRef):null;await this.repo.touch(tenantId,Number(row.id),event,encBridge);return{ignored:false,session:await this.sessions.get(tenantId,Number(row.id))};
  }
  private async complete(tenantId:number,id:number,traceId:string,conversationId:number|null){const current=await this.sessions.get(tenantId,id);if(['completed','failed','cancelled'].includes(current.state))return{ignored:true,reason:'already_completed',session:current};if(current.state!=='ending')await this.sessions.transition(tenantId,id,'ending',traceId);const completed=await this.sessions.transition(tenantId,id,'completed',traceId);if(conversationId)await this.store.query(`UPDATE ai_conversations SET status='completed',ended_at=NOW(),summary='Voice control-plane session completed without media' WHERE tenant_id=? AND id=? AND status='active'`,[tenantId,conversationId]);this.metrics.completedSessions++;return{ignored:false,session:completed}}
  async handleSyntheticSessionEvent(tenantId:number,id:number,eventType:string,traceId:string){const session=await this.sessions.get(tenantId,id);return eventType==='StasisEnd'?this.complete(tenantId,id,traceId,session.conversationId):{ignored:false,session}}
}
