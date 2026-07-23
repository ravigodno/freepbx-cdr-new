import crypto from "node:crypto";
import type { MediaTransportAdapter } from "../mediaTransportAdapter.js";
import type { AudioFrame, MediaTransportContext } from "../mediaTypes.js";
import { MediaError } from "../mediaErrors.js";
import { mediaWorkerClient } from "../../media-worker/mediaWorkerClient.js";
import type { MediaWorkerEnvelope } from "../../media-worker/mediaWorkerProtocol.js";

export interface AudioSocketServerConfig {
  host: "127.0.0.1" | "::1";
  port: number;
  connectionTimeoutMs: number;
  transportFormat: "ast18_slin8" | "slin16";
}
export function readAudioSocketServerConfig(): AudioSocketServerConfig {
  const host = process.env.PBXPULS_AI_AUDIOSOCKET_HOST === "::1" ? "::1" : "127.0.0.1";
  const configured = Number(process.env.PBXPULS_AI_AUDIOSOCKET_PORT || 0);
  return {
    host,
    port: Number.isInteger(configured) && configured >= 1024 && configured <= 65535 ? configured : 0,
    connectionTimeoutMs: 5000,
    transportFormat: process.env.PBXPULS_AI_AUDIOSOCKET_PACKET_MODE === "slin16"
      ? "slin16" : "ast18_slin8",
  };
}

export type PlayoutLifecycleEvent = {
  type: "started" | "completed" | "interrupted";
  responseId?: string;
  itemId?: string;
  playedAudioMs: number;
  discardedAudioMs?: number;
};

export class AudioSocketAdapter implements MediaTransportAdapter {
  private context: MediaTransportContext | null = null;
  private sessionRef = crypto.randomUUID();
  private connectionId = "";
  private externalHost = "";
  private authenticated = false;
  private unsubscribeWorker: (() => void) | null = null;
  private handlers = new Set<(frame: AudioFrame) => void>();
  private playoutHandlers = new Set<(frame: AudioFrame) => void>();
  private lifecycleHandlers = new Set<(event: PlayoutLifecycleEvent) => void>();
  private metrics: Record<string, any> = {};
  private pending: Array<{response_ref:string;item_ref:string;sequence:number;pcm:Buffer}> = [];
  private flushScheduled = false;
  private ingressStartedAt: number | null = null;

  getCapabilities() {
    const config = readAudioSocketServerConfig(), ast18 = config.transportFormat === "ast18_slin8";
    return { mode:"audiosocket" as const, available:true, live:true, network:true,
      codecs:["slin16"] as const,
      audioSocketProtocol:{supportedInboundPacketTypes:[0x10,0x12],
        supportedOutboundPacketTypes:ast18?[0x10]:[0x12],
        preferredAsteriskPacketType:ast18?0x10:0x12,
        preferredAsteriskSampleRate:ast18?8000:16000,
        internalSampleRate:ast18?8000:16000,resamplingRequired:false,
        transportFormat:config.transportFormat}};
  }
  async validateConfig(){const c=readAudioSocketServerConfig();return{valid:c.port>0,errorCode:c.port>0?undefined:"live_media_not_configured"}}
  async createTransport(context: MediaTransportContext) {
    const config=readAudioSocketServerConfig();
    if(!config.port)throw new MediaError("feature_disabled",503,"AudioSocket port is not configured");
    this.context=context;
    this.unsubscribeWorker=mediaWorkerClient.subscribe(this.sessionRef,(event)=>this.event(event));
    const ready=await mediaWorkerClient.request({version:1,type:"create_session",session_ref:this.sessionRef,
      payload:{host:config.host,port:config.port,transport_format:config.transportFormat,
        prebuffer_ms:Number(process.env.PBXPULS_AI_PLAYOUT_PREBUFFER_MS||80),
        max_response_seconds:Number(process.env.PBXPULS_AI_MAX_SINGLE_RESPONSE_AUDIO_SECONDS||60)}});
    const payload=ready.payload as any;
    this.externalHost=payload.external_host;
    this.connectionId=payload.connection_id;
  }
  async start(){
    if(this.authenticated)return;
    await new Promise<void>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new MediaError("provider_not_configured",504,"AudioSocket connection timed out")),5000);
      const off=this.subscribeLifecycleInternal((event)=>{
        if(event.type==="connected"){clearTimeout(timeout);off();resolve()}
      });
    });
  }
  private connectedHandlers=new Set<(event:{type:"connected"})=>void>();
  private subscribeLifecycleInternal(handler:(event:{type:"connected"})=>void){this.connectedHandlers.add(handler);return()=>this.connectedHandlers.delete(handler)}
  private event(event:MediaWorkerEnvelope){
    const payload=event.payload as any;
    if(event.type==="session_ready"&&payload?.authenticated){
      this.authenticated=true;for(const handler of this.connectedHandlers)handler({type:"connected"});
    } else if(event.type==="ingress_audio"&&this.context){
      if(this.ingressStartedAt===null)this.ingressStartedAt=Date.now()-Number(event.sequence||0)*20;
      const frame:AudioFrame={codec:"slin16",sampleRate:Number(payload.sample_rate),channels:1,
        durationMs:20,payload:new Uint8Array(payload.pcm),sequence:Number(event.sequence||0),
        timestampMs:this.ingressStartedAt+Number(event.sequence||0)*20,source:Number(payload.sample_rate)===8000?"audiosocket_ast18_slin8":"audiosocket_slin16",traceId:this.context.traceId,
        voiceSessionId:this.context.voiceSessionId,mediaSessionId:this.context.mediaSessionId};
      for(const handler of this.handlers)handler(frame);
    } else if(event.type==="frame_played"&&this.context){
      const frame:AudioFrame={codec:"slin16",sampleRate:16000,channels:1,durationMs:20,
        payload:new Uint8Array(),sequence:Number(event.sequence||0),timestampMs:Date.now(),
        source:"audiosocket_worker",traceId:this.context.traceId,voiceSessionId:this.context.voiceSessionId,
        mediaSessionId:this.context.mediaSessionId,responseId:event.response_ref,itemId:event.item_ref};
      for(const handler of this.playoutHandlers)handler(frame);
    } else if(event.type==="response_playout_started"||event.type==="response_playout_completed"||event.type==="response_playout_interrupted"){
      const mapped:PlayoutLifecycleEvent={type:event.type==="response_playout_started"?"started":event.type==="response_playout_completed"?"completed":"interrupted",
        responseId:event.response_ref,itemId:event.item_ref,playedAudioMs:Number(payload?.played_audio_ms||0),
        discardedAudioMs:Number(payload?.discarded_audio_ms||0)};
      for(const handler of this.lifecycleHandlers)handler(mapped);
    }
    if(payload?.metrics)this.metrics=payload.metrics;
    if(event.type==="session_metrics")this.metrics=payload||this.metrics;
  }
  async sendFrame(frame:AudioFrame){
    if(!this.authenticated)throw new MediaError("provider_not_configured",503,"AudioSocket is not connected");
    const expectedBytes=frame.sampleRate===8000?320:640;
    if(frame.codec!=="slin16"||![8000,16000].includes(frame.sampleRate)||frame.payload.byteLength!==expectedBytes)
      throw new MediaError("invalid_request",400,"Invalid AudioSocket output frame");
    this.pending.push({response_ref:frame.responseId||"unscoped",item_ref:frame.itemId||"",
      sequence:frame.sequence,pcm:Buffer.from(frame.payload)});
    if(!this.flushScheduled){this.flushScheduled=true;setImmediate(()=>void this.flush())}
    return {accepted:true as const};
  }
  private async flush(){
    this.flushScheduled=false;
    while(this.pending.length){
      const frames=this.pending.splice(0,20);
      const result=await mediaWorkerClient.request({version:1,type:"enqueue_response_audio",
        session_ref:this.sessionRef,payload:{frames}});
      const payload=result.payload as any;if(payload?.metrics)this.metrics=payload.metrics;
    }
  }
  subscribeFrames(handler:(frame:AudioFrame)=>void){this.handlers.add(handler);return()=>this.handlers.delete(handler)}
  subscribePlayout(handler:(frame:AudioFrame)=>void){this.playoutHandlers.add(handler);return()=>this.playoutHandlers.delete(handler)}
  subscribePlayoutLifecycle(handler:(event:PlayoutLifecycleEvent)=>void){this.lifecycleHandlers.add(handler);return()=>this.lifecycleHandlers.delete(handler)}
  async providerResponseDone(responseId:string){await mediaWorkerClient.request({version:1,type:"provider_response_done",session_ref:this.sessionRef,response_ref:responseId})}
  async clearPlayoutAsync(responseId?:string,reason:"barge_in"|"session_end"="barge_in"){
    if(reason==="session_end")return 0;
    const result=await mediaWorkerClient.request({version:1,type:"cancel_response",session_ref:this.sessionRef,response_ref:responseId});
    const payload=result.payload as any;if(payload?.metrics)this.metrics=payload.metrics;
    return Number(payload?.discarded_audio_ms||0);
  }
  clearPlayout(){return 0}
  getHealth(){return{state:this.authenticated?"connected":this.externalHost?"listening":"disabled",failureCode:null,worker:mediaWorkerClient.getHealth()}}
  getProtocolMetrics(){return{...this.metrics,worker:mediaWorkerClient.getHealth()}}
  getEndpoint(){return{externalHost:this.externalHost,connectionId:this.connectionId}}
  async stop(){
    try{await this.flush()}catch{}
    try{await mediaWorkerClient.request({version:1,type:"close_session",session_ref:this.sessionRef},1500)}catch{}
    this.unsubscribeWorker?.();this.unsubscribeWorker=null;this.authenticated=false;this.context=null;
    this.externalHost="";this.connectionId="";
    this.ingressStartedAt=null;
    this.handlers.clear();this.playoutHandlers.clear();this.lifecycleHandlers.clear();this.connectedHandlers.clear();
  }
}
