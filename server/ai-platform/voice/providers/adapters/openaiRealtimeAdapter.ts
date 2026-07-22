import { createRequire } from 'module';
import type { AudioFrame } from '../../media/mediaTypes.js';
import type { RealtimeVoiceProviderAdapter } from '../realtimeVoiceProviderAdapter.js';
import type { RealtimeVoiceConfig, RealtimeVoiceEvent } from '../realtimeVoiceTypes.js';
import { RealtimeVoiceError } from '../realtimeVoiceErrors.js';
import { normalizeOpenAIRealtimeEvent } from '../realtimeVoiceEventNormalizer.js';

export function readOpenAIRealtimeConfig() { const apiKey=process.env.OPENAI_API_KEY||'',url=process.env.PBXPULS_OPENAI_REALTIME_URL||'wss://api.openai.com/v1/realtime',model=process.env.PBXPULS_OPENAI_REALTIME_MODEL||'gpt-realtime';return{configured:Boolean(apiKey),apiKey,url,model}; }
export class OpenAIRealtimeAdapter implements RealtimeVoiceProviderAdapter {
  private socket:any=null;private handlers=new Set<(event:RealtimeVoiceEvent)=>void|Promise<void>>();private config:RealtimeVoiceConfig|null=null;private health:{state:'not_configured'|'disconnected'|'connecting'|'connected'|'failed';failureCode:string|null;connectedAt:string|null}={state:'disconnected',failureCode:null,connectedAt:null};private sequence=0;
  getKey(){return'openai_realtime'}
  getCapabilities(){const pcm={codec:'slin16'as const,sampleRate:24000,channels:1 as const,frameDurationMs:20};return{speechToSpeech:true,streamingInput:true,streamingOutput:true,serverVad:true,clientVad:true,interruption:true,tools:false,transcripts:true,multilingual:true,emotionControl:false,supportedInputFormats:[pcm],supportedOutputFormats:[pcm]}}
  async validateConfig(config:RealtimeVoiceConfig){return{valid:Boolean(config.apiKey&&config.url&&config.model),errorCode:config.apiKey?undefined:'provider_not_configured'}}
  async connect(config:RealtimeVoiceConfig,signal?:AbortSignal){
    if(!(await this.validateConfig(config)).valid)throw new RealtimeVoiceError('provider_not_configured',503,'Realtime provider is not configured');
    if(!/^wss:\/\/api\.openai\.com\//.test(String(config.url)))throw new RealtimeVoiceError('invalid_request',400,'Realtime provider URL is not allowlisted');
    let WebSocketClient:any;try{WebSocketClient=createRequire(`${process.cwd()}/package.json`)('ws')}catch{throw new RealtimeVoiceError('provider_not_configured',503,'Secure WebSocket transport is unavailable')}
    this.config=config;this.health={state:'connecting',failureCode:null,connectedAt:null};const url=new URL(config.url!);url.searchParams.set('model',String(config.model));
    await new Promise<void>((resolve,reject)=>{let settled=false;const socket=new WebSocketClient(url,{headers:{Authorization:`Bearer ${config.apiKey}`}});this.socket=socket;const timer=setTimeout(()=>{socket.close();reject(new RealtimeVoiceError('provider_not_configured',504,'Realtime provider connection timed out'))},config.timeoutMs);const abort=()=>{socket.close();if(!settled)reject(new RealtimeVoiceError('conflict',409,'Realtime provider connection cancelled'))};signal?.addEventListener('abort',abort,{once:true});socket.on('open',()=>{settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);this.health={state:'connected',failureCode:null,connectedAt:new Date().toISOString()};resolve()});socket.on('error',()=>{this.health={state:'failed',failureCode:'provider_connection_failed',connectedAt:null};if(!settled){clearTimeout(timer);reject(new RealtimeVoiceError('provider_not_configured',502,'Realtime provider connection failed'))}});socket.on('message',(data:unknown)=>{try{const normalized=normalizeOpenAIRealtimeEvent(JSON.parse(String(data)),payload=>({sequence:this.sequence++,timestampMs:Date.now(),direction:'egress',codec:'slin16',sampleRate:24000,channels:1,durationMs:20,payload,source:'openai_realtime',traceId:'provider',voiceSessionId:0,mediaSessionId:0}));if(normalized)void this.emit(normalized)}catch{}});socket.on('close',()=>{this.socket=null;this.health={state:'disconnected',failureCode:null,connectedAt:null}})})
  }
  async configureSession(config:RealtimeVoiceConfig){this.send({type:'session.update',session:{type:'realtime',model:config.model,instructions:config.instructions,audio:{input:{format:{type:'audio/pcm',rate:24000},turn_detection:config.serverVad?{type:'server_vad'}:null},output:{format:{type:'audio/pcm',rate:24000},voice:config.voice||'marin'}}}})}
  async appendAudio(frame:AudioFrame){this.send({type:'input_audio_buffer.append',audio:Buffer.from(frame.payload).toString('base64')})}
  async commitInput(){this.send({type:'input_audio_buffer.commit'});this.send({type:'response.create'})}
  async cancelResponse(){this.send({type:'response.cancel'})}
  async sendToolResult(){throw new RealtimeVoiceError('permission_denied',403,'External realtime tools are disabled')}
  async close(){this.socket?.close();this.socket=null;this.config=null;this.health={state:'disconnected',failureCode:null,connectedAt:null}}
  getHealth(){return{...this.health}}
  subscribeEvents(handler:(event:RealtimeVoiceEvent)=>void|Promise<void>){this.handlers.add(handler);return()=>this.handlers.delete(handler)}
  private send(value:unknown){if(!this.socket||this.socket.readyState!==1)throw new RealtimeVoiceError('provider_not_configured',503,'Realtime provider is not connected');this.socket.send(JSON.stringify(value))}
  private async emit(event:RealtimeVoiceEvent){for(const handler of this.handlers)await handler(event)}
}
