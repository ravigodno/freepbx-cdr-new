import type { PBXLiveCallContext, PBXTransferService } from '../../services/pbxTransferService.js';
import type { VoiceSessionService } from '../voice/voiceSessionService.js';
import type { TransferDestination } from './transferTypes.js';
export interface TransferExecutionAdapter { validateLiveContext(liveCallId:string,signal?:AbortSignal):Promise<PBXLiveCallContext|null>; validateVoiceSession?(tenantId:number,voiceSessionId:number,signal?:AbortSignal):Promise<PBXLiveCallContext|null>; resolveCurrentChannel(liveCallId:string,signal?:AbortSignal):Promise<PBXLiveCallContext|null>; executeBlindTransfer(context:PBXLiveCallContext,destination:TransferDestination,signal?:AbortSignal):Promise<{ok:boolean;actionRef:string|null;safeMessage:string}>; getTransferStatus(actionRef:string,signal?:AbortSignal):Promise<'completed'|'failed'|'unknown'> }
export class PBXTransferExecutionAdapter implements TransferExecutionAdapter {
  constructor(private readonly service:PBXTransferService,private readonly voiceSessions?:VoiceSessionService){}
  validateLiveContext(id:string,signal?:AbortSignal){return this.service.resolveLiveCall(id,signal)}
  async validateVoiceSession(tenantId:number,voiceSessionId:number){if(!this.voiceSessions)return null;const trusted=await this.voiceSessions.trustedLiveContext(tenantId,voiceSessionId);return{liveCallId:`voice-session:${voiceSessionId}`,active:true,channelRef:trusted.channelRef}}
  resolveCurrentChannel(id:string,signal?:AbortSignal){return this.service.resolveLiveCall(id,signal)}
  async executeBlindTransfer(context:PBXLiveCallContext,destination:TransferDestination,signal?:AbortSignal){if(!['extension','queue','ring_group'].includes(destination.type)||!destination.ref)return{ok:false,actionRef:null,safeMessage:'Transfer destination is not executable'};return this.service.executeBlindTransfer(context,{type:destination.type as any,ref:destination.ref,safeLabel:destination.safeLabel,available:destination.available},signal)}
  getTransferStatus(id:string,signal?:AbortSignal){return this.service.getTransferStatus(id,signal)}
}
