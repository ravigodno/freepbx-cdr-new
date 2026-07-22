import type { AudioFrame } from "./mediaTypes.js";
import { AudioResampler } from "./audioResampler.js";

const INTERNAL_SAMPLE_RATE = 16000;
const INTERNAL_FRAME_DURATION_MS = 20;
const INTERNAL_FRAME_BYTES = 640;
const MIN_PACKET_DURATION_MS = 5;
const MAX_PACKET_DURATION_MS = 200;
const MAX_FRAMES_PER_PACKET = 10;
const METRIC_SAMPLE_LIMIT = 1024;
export const PACKETIZATION_ERROR_THRESHOLD = 5;

export interface SourcePcmFormat {
  codec: "slin16";
  sampleRate: 8000 | 16000 | 24000;
  channels: 1;
}

export interface AudioPacketizerContext {
  source: string;
  traceId: string;
  voiceSessionId: number;
  mediaSessionId: number;
}

export interface AudioPacketizerMetrics {
  sourcePackets: number;
  sourcePacketDurationMsAvg: number | null;
  sourcePacketDurationMsP95: number | null;
  packetizedFrames: number;
  framesPerPacketAvg: number | null;
  framesPerPacketP95: number | null;
  remainderBytes: number;
  remainderPeakBytes: number;
  partialFrameDropped: number;
  oversizedPackets: number;
  oddLengthPackets: number;
  packetizationErrors: number;
  consecutivePacketizationErrors: number;
  packetizationErrorThreshold: number;
}

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
};

export class AudioPacketizer {
  private remainder = Buffer.alloc(0);
  private sequence = 0;
  private nextTimestampMs: number | null = null;
  private sourceDurations: number[] = [];
  private framesPerPacket: number[] = [];
  private readonly resampler = new AudioResampler();
  private metrics = {
    sourcePackets: 0,
    packetizedFrames: 0,
    remainderPeakBytes: 0,
    partialFrameDropped: 0,
    oversizedPackets: 0,
    oddLengthPackets: 0,
    packetizationErrors: 0,
    consecutivePacketizationErrors: 0,
  };

  pushPcm(
    payload: Uint8Array,
    format: SourcePcmFormat,
    timestampMs: number,
    context: AudioPacketizerContext,
  ): AudioFrame[] {
    this.metrics.sourcePackets++;
    if (payload.byteLength % 2 !== 0) {
      this.metrics.oddLengthPackets++;
      this.rejectPacket();
      return [];
    }
    const sourceSamples = payload.byteLength / 2;
    const durationMs = (sourceSamples / format.sampleRate) * 1000;
    if (
      format.codec !== "slin16" ||
      format.channels !== 1 ||
      ![8000, 16000, 24000].includes(format.sampleRate) ||
      durationMs < MIN_PACKET_DURATION_MS ||
      durationMs > MAX_PACKET_DURATION_MS
    ) {
      if (durationMs > MAX_PACKET_DURATION_MS) this.metrics.oversizedPackets++;
      this.rejectPacket();
      return [];
    }

    try {
      const decoded = new Int16Array(sourceSamples);
      const view = new DataView(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
      );
      for (let index = 0; index < sourceSamples; index++)
        decoded[index] = view.getInt16(index * 2, true);
      const normalized = this.resampler.resamplePcm16(
        decoded,
        format.sampleRate,
        INTERNAL_SAMPLE_RATE,
      );
      const normalizedBytes = Buffer.allocUnsafe(normalized.length * 2);
      for (let index = 0; index < normalized.length; index++)
        normalizedBytes.writeInt16LE(normalized[index], index * 2);
      const combined = Buffer.concat([this.remainder, normalizedBytes]);
      const frameCount = Math.floor(combined.length / INTERNAL_FRAME_BYTES);
      if (frameCount > MAX_FRAMES_PER_PACKET) {
        this.metrics.oversizedPackets++;
        this.rejectPacket();
        return [];
      }
      this.sourceDurations.push(durationMs);
      this.framesPerPacket.push(frameCount);
      if (this.sourceDurations.length > METRIC_SAMPLE_LIMIT)
        this.sourceDurations.shift();
      if (this.framesPerPacket.length > METRIC_SAMPLE_LIMIT)
        this.framesPerPacket.shift();
      this.nextTimestampMs ??= timestampMs;
      const frames: AudioFrame[] = [];
      for (let index = 0; index < frameCount; index++) {
        const start = index * INTERNAL_FRAME_BYTES;
        frames.push({
          sequence: this.sequence++,
          timestampMs: this.nextTimestampMs,
          direction: "ingress",
          codec: "slin16",
          sampleRate: INTERNAL_SAMPLE_RATE,
          channels: 1,
          durationMs: INTERNAL_FRAME_DURATION_MS,
          payload: new Uint8Array(
            combined.subarray(start, start + INTERNAL_FRAME_BYTES),
          ),
          ...context,
        });
        this.nextTimestampMs += INTERNAL_FRAME_DURATION_MS;
      }
      this.remainder = Buffer.from(
        combined.subarray(frameCount * INTERNAL_FRAME_BYTES),
      );
      this.metrics.remainderPeakBytes = Math.max(
        this.metrics.remainderPeakBytes,
        this.remainder.length,
      );
      this.metrics.packetizedFrames += frames.length;
      this.metrics.consecutivePacketizationErrors = 0;
      return frames;
    } catch {
      this.rejectPacket();
      return [];
    }
  }

  flush(): AudioFrame[] {
    if (this.remainder.length) this.metrics.partialFrameDropped++;
    this.remainder = Buffer.alloc(0);
    return [];
  }

  reset() {
    this.remainder = Buffer.alloc(0);
    this.sequence = 0;
    this.nextTimestampMs = null;
    this.sourceDurations = [];
    this.framesPerPacket = [];
    this.metrics = {
      sourcePackets: 0,
      packetizedFrames: 0,
      remainderPeakBytes: 0,
      partialFrameDropped: 0,
      oversizedPackets: 0,
      oddLengthPackets: 0,
      packetizationErrors: 0,
      consecutivePacketizationErrors: 0,
    };
  }

  getMetrics(): AudioPacketizerMetrics {
    const durationTotal = this.sourceDurations.reduce(
      (sum, item) => sum + item,
      0,
    );
    const framesTotal = this.framesPerPacket.reduce(
      (sum, item) => sum + item,
      0,
    );
    return {
      ...this.metrics,
      sourcePacketDurationMsAvg: this.sourceDurations.length
        ? durationTotal / this.sourceDurations.length
        : null,
      sourcePacketDurationMsP95: percentile(this.sourceDurations, 0.95),
      framesPerPacketAvg: this.framesPerPacket.length
        ? framesTotal / this.framesPerPacket.length
        : null,
      framesPerPacketP95: percentile(this.framesPerPacket, 0.95),
      remainderBytes: this.remainder.length,
      packetizationErrorThreshold: PACKETIZATION_ERROR_THRESHOLD,
    };
  }

  private rejectPacket() {
    this.metrics.packetizationErrors++;
    this.metrics.consecutivePacketizationErrors++;
  }
}
