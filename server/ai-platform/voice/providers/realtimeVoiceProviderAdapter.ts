import type { AudioFrame } from "../media/mediaTypes.js";
import type {
  RealtimeProviderHealth,
  RealtimeVoiceCapabilities,
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
} from "./realtimeVoiceTypes.js";
export interface RealtimeVoiceProviderAdapter {
  getKey(): string;
  getCapabilities(): RealtimeVoiceCapabilities;
  validateConfig(
    config: RealtimeVoiceConfig,
  ): Promise<{ valid: boolean; errorCode?: string }>;
  connect(config: RealtimeVoiceConfig, signal?: AbortSignal): Promise<void>;
  configureSession(config: RealtimeVoiceConfig): Promise<void>;
  appendAudio(frame: AudioFrame): Promise<void>;
  commitInput(): Promise<void>;
  createResponse?(instructions?:string): Promise<void>;
  createFarewellResponse?(): Promise<void>;
  createResponseForRemainder?(itemId:string|undefined,text:string):Promise<void>;
  retryResponse?(itemId:string|undefined,maxOutputTokens:number):Promise<void>;
  createFallbackResponse?(itemId:string|undefined):Promise<void>;
  startInitialGreeting?(text: string): Promise<void>;
  cancelResponse(responseId?: string): Promise<void>;
  truncateResponse?(itemId: string, audioEndMs: number): Promise<void>;
  sendToolResult(callId: string, result: unknown): Promise<void>;
  close(): Promise<void>;
  getHealth(): RealtimeProviderHealth;
  subscribeEvents(
    handler: (event: RealtimeVoiceEvent) => void | Promise<void>,
  ): () => void;
}
