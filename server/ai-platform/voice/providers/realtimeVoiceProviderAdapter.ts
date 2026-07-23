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
  createResponse?(): Promise<void>;
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
