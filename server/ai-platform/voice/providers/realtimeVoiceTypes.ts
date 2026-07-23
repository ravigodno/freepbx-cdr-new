import type { AudioFrame, AudioFormat } from '../media/mediaTypes.js';

export type RealtimeVoiceState = 'created'|'connecting'|'connected'|'configured'|'listening'|'responding'|'interrupted'|'closing'|'completed'|'failed'|'cancelled';
export type RealtimeTranscriptKind = 'input_partial'|'input_final'|'output_partial'|'output_final'|'output_generated_partial'|'output_generated_final';
export interface RealtimeVoiceCapabilities { speechToSpeech:boolean;streamingInput:boolean;streamingOutput:boolean;serverVad:boolean;clientVad:boolean;interruption:boolean;tools:boolean;transcripts:boolean;multilingual:boolean;emotionControl:boolean;supportedInputFormats:AudioFormat[];supportedOutputFormats:AudioFormat[] }
export interface RealtimeVoiceConfig { providerKey:string;apiKey?:string;url?:string;model?:string;voice?:string;language:string;instructions:string;inputFormat:AudioFormat;outputFormat:AudioFormat;serverVad:boolean;tools:PublicRealtimeToolDefinition[];timeoutMs:number }
export interface PublicRealtimeToolDefinition { key:string;description:string;inputSchema:Record<string,unknown> }
export interface RealtimeProviderHealth { state:'not_configured'|'disconnected'|'connecting'|'connected'|'failed';failureCode:string|null;connectedAt:string|null }
export type RealtimeVoiceEvent =
  | {type:'session_connected';providerSessionRef?:string}
  | {type:'session_configured'}
  | {type:'input_audio_started'|'input_audio_committed'}
  | {type:'input_audio_stopped';itemId?:string}
  | {type:'output_audio';frame:AudioFrame;responseId?:string;itemId?:string}
  | {type:'response_started'|'response_completed'|'response_cancelled';eventId?:string;responseId?:string;usage?:Record<string,unknown>}
  | {type:'transcript';kind:RealtimeTranscriptKind;text:string;eventId?:string;itemId?:string;responseId?:string;contentIndex?:number;confidence?:number}
  | {type:'response_item';status:'added'|'done';eventId?:string;itemId?:string;role?:string}
  | {type:'transcript_unavailable';speaker:'caller'|'ai';errorCode:string}
  | {type:'tool_call';toolKey:string;arguments:Record<string,unknown>;callId:string}
  | {type:'error';errorCode:string};
export interface RealtimeVoiceSessionProjection { id:number;tenantId:number;voiceSessionId:number;mediaSessionId:number;providerKey:string;state:RealtimeVoiceState;inputCodec:string;outputCodec:string;inputSampleRate:number;outputSampleRate:number;language:string;voiceKeySafe:string|null;serverVadEnabled:boolean;toolsEnabled:boolean;connectedAt:string|null;firstInputAudioAt:string|null;firstOutputAudioAt:string|null;endedAt:string|null;inputFrames:number;outputFrames:number;inputAudioMs:number;outputAudioMs:number;firstResponseLatencyMs:number|null;speechEndToFirstAudioMs?:number|null;commitToFirstAudioMs?:number|null;sessionStartToFirstAudioMs?:number|null;interruptionCount:number;toolCallCount:number;failureCode:string|null;transcripts:Array<{kind:RealtimeTranscriptKind;text:string}>;transferRequired:boolean;callbackOfferRequired:boolean;queueDepth:number;greetingStatus:'not_started'|'started'|'completed'|'interrupted';greetingStartedAt:string|null;greetingCompletedAt:string|null;greetingInterrupted:boolean }
