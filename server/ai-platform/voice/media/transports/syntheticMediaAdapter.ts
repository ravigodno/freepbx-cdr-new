import type { MediaTransportAdapter } from "../mediaTransportAdapter.js";
import type {
  AudioFrame,
  MediaTransportContext,
  SyntheticFixture,
} from "../mediaTypes.js";
import { MediaError } from "../mediaErrors.js";
export class SyntheticMediaAdapter implements MediaTransportAdapter {
  private context: MediaTransportContext | null = null;
  private handlers = new Set<(frame: AudioFrame) => void>();
  private state = "idle";
  private sequence = 0;
  getCapabilities() {
    return {
      mode: "synthetic" as const,
      available: true,
      live: false,
      network: false,
      codecs: ["slin16", "ulaw", "alaw"] as const,
    };
  }
  validateConfig = async () => ({ valid: true });
  async createTransport(context: MediaTransportContext) {
    this.context = context;
    this.state = "created";
  }
  async start() {
    if (!this.context)
      throw new MediaError(
        "conflict",
        409,
        "Synthetic transport is not created",
      );
    this.state = "streaming";
  }
  async stop() {
    this.state = "stopped";
    this.context = null;
    this.handlers.clear();
  }
  async sendFrame(frame: AudioFrame) {
    if (this.state !== "streaming")
      throw new MediaError(
        "conflict",
        409,
        "Synthetic transport is not streaming",
      );
    for (const handler of this.handlers)
      handler({ ...frame, direction: "ingress", source: "synthetic_loopback" });
  }
  subscribeFrames(handler: (frame: AudioFrame) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  getHealth() {
    return { state: this.state, failureCode: null };
  }
  getFormat() {
    return this.context?.format || null;
  }
  async fixture(type: SyntheticFixture, count = 1) {
    if (!this.context || this.state !== "streaming")
      throw new MediaError(
        "conflict",
        409,
        "Synthetic transport is not streaming",
      );
    const frames: AudioFrame[] = [];
    for (let n = 0; n < Math.max(1, Math.min(count, 100)); n++) {
      if (type === "packet_loss" && n % 3 === 1) {
        this.sequence++;
        continue;
      }
      const samples =
          (this.context.format.sampleRate *
            this.context.format.frameDurationMs) /
          1000,
        pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i++) {
        const t =
          (this.sequence * samples + i) / this.context.format.sampleRate;
        if (type === "speech")
          pcm[i] = Math.round(5000 * Math.sin(2 * Math.PI * 220 * t));
        else if (type === "noise")
          pcm[i] = ((i * 1103515245 + this.sequence * 12345) % 1000) - 500;
      }
      let sequence = this.sequence++;
      if (type === "reordered_sequence" && n === 1) sequence++;
      if (type === "duplicate_sequence" && n === 1) sequence--;
      frames.push({
        sequence,
        timestampMs: Date.now(),
        direction: "ingress",
        codec: "slin16",
        sampleRate: this.context.format.sampleRate,
        channels: 1,
        durationMs: 20,
        payload: new Uint8Array(pcm.buffer),
        source: "synthetic_fixture",
        traceId: this.context.traceId,
        voiceSessionId: this.context.voiceSessionId,
        mediaSessionId: this.context.mediaSessionId,
      });
    }
    for (const frame of frames)
      for (const handler of this.handlers) handler(frame);
    return frames.length;
  }
}
