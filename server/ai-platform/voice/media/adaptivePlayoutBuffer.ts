import { performance } from "node:perf_hooks";
import type { AudioFrame } from "./mediaTypes.js";

export type PlayoutMetrics = {
  initialPrebufferMs: number;
  adaptivePrebufferMs: number;
  bufferedAudioMs: number;
  playoutUnderruns: number;
  outputBursts: number;
  lateFrames: number;
  egressPacketGapAvgMs: number | null;
  egressPacketGapP95Ms: number | null;
  egressPacketGapMaxMs: number | null;
  gapsOver40Ms: number;
  gapsOver80Ms: number;
  gapsOver120Ms: number;
  gapsOver200Ms: number;
  eventLoopLagP95Ms: number | null;
  eventLoopLagMaxMs: number | null;
};

type Options = {
  frameDurationMs?: number;
  initialPrebufferMs?: number;
  minPrebufferMs?: number;
  maxPrebufferMs?: number;
  maximumBufferedMs?: number;
  now?: () => number;
};

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

export class AdaptivePlayoutBuffer {
  private readonly frameDurationMs: number;
  private readonly minPrebufferMs: number;
  private readonly maxPrebufferMs: number;
  private readonly maximumBufferedMs: number;
  private readonly now: () => number;
  private targetPrebufferMs: number;
  private queue: AudioFrame[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private prebuffering = true;
  private nextTickAt = 0;
  private prebufferStartedAt = 0;
  private lastWriteAt: number | null = null;
  private stableFrames = 0;
  private consecutiveUnderruns = 0;
  private gaps: number[] = [];
  private eventLoopLags: number[] = [];
  private counters = { underruns: 0, bursts: 0, late: 0 };

  constructor(
    private readonly write: (frame: AudioFrame) => Promise<void>,
    options: Options = {},
  ) {
    this.frameDurationMs = options.frameDurationMs || 20;
    this.minPrebufferMs = options.minPrebufferMs || 60;
    this.maxPrebufferMs = options.maxPrebufferMs || 200;
    this.maximumBufferedMs = options.maximumBufferedMs || 1000;
    this.targetPrebufferMs = Math.max(
      this.minPrebufferMs,
      Math.min(options.initialPrebufferMs || 80, this.maxPrebufferMs),
    );
    this.now = options.now || (() => performance.now());
  }

  enqueue(frame: AudioFrame) {
    const capacity = Math.floor(this.maximumBufferedMs / this.frameDurationMs);
    if (this.queue.length >= capacity) {
      this.queue.shift();
      this.counters.late++;
    }
    if (this.queue.length >= 3) this.counters.bursts++;
    this.queue.push(frame);
    if (!this.running) this.start();
  }

  private start() {
    this.running = true;
    this.prebuffering = true;
    this.nextTickAt = this.now();
    this.prebufferStartedAt = this.nextTickAt;
    this.schedule();
  }

  private schedule() {
    if (!this.running || this.timer) return;
    const delay = Math.max(0, this.nextTickAt - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private async tick() {
    if (!this.running) return;
    const now = this.now();
    const lag = Math.max(0, now - this.nextTickAt);
    this.eventLoopLags.push(lag);
    if (this.eventLoopLags.length > 1000) this.eventLoopLags.shift();
    if (lag > this.frameDurationMs) this.counters.late++;
    if (
      this.prebuffering &&
      this.queue.length * this.frameDurationMs < this.targetPrebufferMs &&
      now - this.prebufferStartedAt < this.targetPrebufferMs
    ) {
      this.nextTickAt = now + this.frameDurationMs;
      this.schedule();
      return;
    }
    this.prebuffering = false;
    const frame = this.queue.shift();
    if (!frame) {
      this.counters.underruns++;
      this.consecutiveUnderruns++;
      this.stableFrames = 0;
      this.targetPrebufferMs = Math.min(
        this.maxPrebufferMs,
        this.targetPrebufferMs + this.frameDurationMs,
      );
      this.prebuffering = true;
      this.prebufferStartedAt = now;
      this.running = false;
      return;
    }
    this.consecutiveUnderruns = 0;
    this.stableFrames++;
    if (this.stableFrames >= 500 && this.targetPrebufferMs > this.minPrebufferMs) {
      this.targetPrebufferMs -= this.frameDurationMs;
      this.stableFrames = 0;
    }
    await this.write(frame);
    const writtenAt = this.now();
    if (this.lastWriteAt !== null) {
      this.gaps.push(Math.max(0, writtenAt - this.lastWriteAt));
      if (this.gaps.length > 2000) this.gaps.shift();
    }
    this.lastWriteAt = writtenAt;
    this.nextTickAt += this.frameDurationMs;
    if (this.nextTickAt < writtenAt - this.frameDurationMs)
      this.nextTickAt = writtenAt;
    this.schedule();
  }

  clear(responseId?: string) {
    const before = this.queue.length;
    this.queue = responseId
      ? this.queue.filter((frame) => frame.responseId !== responseId)
      : [];
    const discardedMs = (before - this.queue.length) * this.frameDurationMs;
    this.prebuffering = true;
    this.prebufferStartedAt = this.now();
    this.nextTickAt = this.prebufferStartedAt + this.frameDurationMs;
    return discardedMs;
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }

  metrics(): PlayoutMetrics {
    const gaps = this.gaps;
    const avg = gaps.length
      ? gaps.reduce((sum, value) => sum + value, 0) / gaps.length
      : null;
    return {
      initialPrebufferMs: 80,
      adaptivePrebufferMs: this.targetPrebufferMs,
      bufferedAudioMs: this.queue.length * this.frameDurationMs,
      playoutUnderruns: this.counters.underruns,
      outputBursts: this.counters.bursts,
      lateFrames: this.counters.late,
      egressPacketGapAvgMs: avg,
      egressPacketGapP95Ms: percentile(gaps, 0.95),
      egressPacketGapMaxMs: gaps.length ? Math.max(...gaps) : null,
      gapsOver40Ms: gaps.filter((value) => value > 40).length,
      gapsOver80Ms: gaps.filter((value) => value > 80).length,
      gapsOver120Ms: gaps.filter((value) => value > 120).length,
      gapsOver200Ms: gaps.filter((value) => value > 200).length,
      eventLoopLagP95Ms: percentile(this.eventLoopLags, 0.95),
      eventLoopLagMaxMs: this.eventLoopLags.length
        ? Math.max(...this.eventLoopLags)
        : null,
    };
  }
}
