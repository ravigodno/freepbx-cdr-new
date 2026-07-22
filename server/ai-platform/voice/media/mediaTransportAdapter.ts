import type {
  AudioFrame,
  AudioFormat,
  AudioSocketProtocolMetrics,
  MediaTransportCapabilities,
  MediaTransportContext,
} from "./mediaTypes.js";
export interface MediaTransportAdapter {
  getCapabilities(): MediaTransportCapabilities;
  validateConfig(): Promise<{ valid: boolean; errorCode?: string }>;
  createTransport(context: MediaTransportContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendFrame(frame: AudioFrame): Promise<void>;
  subscribeFrames(handler: (frame: AudioFrame) => void): () => void;
  getHealth(): { state: string; failureCode: string | null };
  getFormat?(): AudioFormat | null;
  getProtocolMetrics?(): AudioSocketProtocolMetrics;
}
