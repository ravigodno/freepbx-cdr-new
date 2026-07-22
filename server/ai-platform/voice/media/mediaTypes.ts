export type MediaTransportMode='synthetic'|'external_media'|'audiosocket';
export type MediaSessionState='created'|'negotiating'|'ready'|'streaming'|'paused'|'draining'|'completed'|'failed'|'cancelled';
export type AudioCodec='ulaw'|'alaw'|'slin16'|'opus';
export interface AudioFormat{codec:AudioCodec;sampleRate:number;channels:1;frameDurationMs:number}
export interface AudioFrame{sequence:number;timestampMs:number;direction:'ingress'|'egress';codec:AudioCodec;sampleRate:number;channels:1;durationMs:number;payload:Uint8Array;source:string;traceId:string;voiceSessionId:number;mediaSessionId:number}
export interface MediaTransportCapabilities{mode:MediaTransportMode;available:boolean;live:boolean;network:boolean;codecs:readonly AudioCodec[]}
export interface MediaTransportContext{tenantId:number;traceId:string;voiceSessionId:number;mediaSessionId:number;format:AudioFormat;signal:AbortSignal}
export interface MediaSessionProjection{id:number;tenantId:number;voiceSessionId:number;transportMode:MediaTransportMode;state:MediaSessionState;codecIn:string;codecOut:string;sampleRateIn:number;sampleRateOut:number;channelsIn:number;channelsOut:number;frameDurationMs:number;ingressFrames:number;egressFrames:number;ingressBytes:number;egressBytes:number;droppedFrames:number;reorderedFrames:number;duplicateFrames:number;jitterMsAvg:number|null;jitterMsP95:number|null;ingressLatencyMsAvg:number|null;egressLatencyMsAvg:number|null;firstAudioAt:string|null;lastAudioAt:string|null;startedAt:string;endedAt:string|null;failureCode:string|null;vadState:string;bargeInCount:number;queueDepth:number;memoryEstimateBytes:number}
export type SyntheticFixture='silence'|'speech'|'noise'|'reordered_sequence'|'duplicate_sequence'|'packet_loss';
