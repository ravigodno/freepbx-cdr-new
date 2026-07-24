import crypto from 'node:crypto';
import type { AriClientAdapter } from '../ari/ariClientAdapter.js';

export class LiveBridgeService { private owned=new Map<number,{bridgeId:string;mediaChannelId:string}>();constructor(private ari:AriClientAdapter){}
 async create(voiceSessionId:number,callerChannel:string,externalHost:string,connectionId:string,app:string){if(this.owned.has(voiceSessionId))return this.owned.get(voiceSessionId)!;const bridgeId=crypto.randomUUID(),mediaChannelId=crypto.randomUUID();await this.ari.createBridge(bridgeId);try{await this.ari.createAudioSocketChannel({channelId:mediaChannelId,app,externalHost,connectionId});await this.ari.addChannelToBridge(bridgeId,callerChannel);await this.ari.addChannelToBridge(bridgeId,mediaChannelId);const value={bridgeId,mediaChannelId};this.owned.set(voiceSessionId,value);return value}catch(error){await this.ari.destroyBridge(bridgeId).catch(()=>{});throw error}}
 async answer(voiceSessionId:number,callerChannel:string){if(!this.owned.has(voiceSessionId))throw new Error('Live bridge is not ready');await this.ari.answerChannel(callerChannel)}
 async releaseCaller(callerChannel:string){await this.ari.continueChannel(callerChannel).catch(()=>this.ari.hangupChannel(callerChannel).catch(()=>{}))}
 async continueCaller(voiceSessionId:number,callerChannel:string,token:string){if(!/^handoff-[a-f0-9]{12}$/.test(token))throw new Error('invalid_handoff_token');await this.cleanup(voiceSessionId);await this.ari.continueChannel(callerChannel,{context:'pbxpuls-ai-handoff',extension:token,priority:1})}
 async hangupCaller(callerChannel:string){await this.ari.hangupChannel(callerChannel)}
 async cleanup(voiceSessionId:number){const value=this.owned.get(voiceSessionId);if(!value)return;this.owned.delete(voiceSessionId);await this.ari.hangupChannel(value.mediaChannelId).catch(()=>{});await this.ari.destroyBridge(value.bridgeId).catch(()=>{})}
 transferAnchor(voiceSessionId:number){return this.owned.get(voiceSessionId)?.mediaChannelId||null}
 has(voiceSessionId:number){return this.owned.has(voiceSessionId)} }
