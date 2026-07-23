import { performance } from "node:perf_hooks";
import type { AudioFrame } from "./mediaTypes.js";

export type PlayoutDiscardReason =
  | "barge_in"
  | "session_end"
  | "malformed"
  | "response_limit";

export type PlayoutMetrics = {
  initialPrebufferMs: number;
  adaptivePrebufferMs: number;
  prebufferMsCurrent: number;
  prebufferMsMin: number;
  prebufferMsAvg: number;
  prebufferMsMax: number;
  bufferedAudioMs: number;
  queuedAudioMsCurrent: number;
  queuedAudioMsPeak: number;
  providerAudioFramesAccepted: number;
  providerAudioDurationMsAccepted: number;
  playoutFramesWritten: number;
  playoutDurationMsWritten: number;
  bargeInDiscardedFrames: number;
  sessionEndDiscardedFrames: number;
  malformedRejectedFrames: number;
  responseLimitRejectedFrames: number;
  audioConservationMismatch: number;
  playoutUnderruns: number;
  playoutPauseCount: number;
  playoutResumeCount: number;
  outputBursts: number;
  realBurstEvents: number;
  framesPerBurstAvg: number | null;
  framesPerBurstP95: number | null;
  framesPerBurstMax: number | null;
  schedulerLateFrames: number;
  schedulerLagAvgMs: number | null;
  schedulerLagP95Ms: number | null;
  schedulerLagMaxMs: number | null;
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
  maxSingleResponseAudioSeconds?: number;
  now?: () => number;
};

type OwnedFrame = {
  frame: AudioFrame;
  acceptedAt: number;
  scheduledPlayoutAt: number | null;
  playedAt: number | null;
};

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

/**
 * Response accumulation and the short anti-jitter prebuffer deliberately share
 * no capacity limit. The queue is bounded by one response's duration; accepted
 * frames are never evicted to compensate for faster-than-realtime delivery.
 */
export class AdaptivePlayoutBuffer {
  private readonly frameDurationMs: number;
  private readonly initialPrebufferMs: number;
  private readonly minPrebufferMs: number;
  private readonly maxPrebufferMs: number;
  private readonly maxResponseFrames: number;
  private readonly now: () => number;
  private targetPrebufferMs: number;
  private queue: OwnedFrame[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private prebuffering = false;
  private playoutEpoch = 0;
  private playoutIndex = 0;
  private lastWriteAt: number | null = null;
  private lastEnqueueAt: number | null = null;
  private currentBurstFrames = 0;
  private stableFrames = 0;
  private queuedPeakFrames = 0;
  private acceptedByResponse = new Map<string, number>();
  private gaps: number[] = [];
  private schedulerLags: number[] = [];
  private prebufferSamples: number[] = [];
  private burstSizes: number[] = [];
  private counters = {
    accepted: 0,
    played: 0,
    bargeIn: 0,
    sessionEnd: 0,
    malformed: 0,
    responseLimit: 0,
    underruns: 0,
    pauses: 0,
    resumes: 0,
    late: 0,
  };

  constructor(
    private readonly write: (frame: AudioFrame) => Promise<void>,
    options: Options = {},
  ) {
    this.frameDurationMs = options.frameDurationMs || 20;
    this.initialPrebufferMs = Math.max(60, Math.min(options.initialPrebufferMs || 80, 200));
    this.minPrebufferMs = Math.max(20, options.minPrebufferMs || 60);
    this.maxPrebufferMs = Math.max(this.minPrebufferMs, options.maxPrebufferMs || 200);
    this.targetPrebufferMs = Math.max(this.minPrebufferMs, Math.min(this.initialPrebufferMs, this.maxPrebufferMs));
    const responseSeconds = Math.max(5, Math.min(options.maxSingleResponseAudioSeconds || 60, 180));
    this.maxResponseFrames = Math.floor((responseSeconds * 1000) / this.frameDurationMs);
    this.now = options.now || (() => performance.now());
  }

  enqueue(frame: AudioFrame) {
    if (!frame.payload.byteLength || frame.durationMs !== this.frameDurationMs) {
      this.counters.malformed++;
      return { accepted: false, reason: "malformed" as const };
    }
    const responseKey = frame.responseId || "unscoped";
    const responseFrames = this.acceptedByResponse.get(responseKey) || 0;
    if (responseFrames >= this.maxResponseFrames) {
      this.counters.responseLimit++;
      return { accepted: false, reason: "response_limit" as const };
    }
    const acceptedAt = this.now();
    this.recordArrivalBurst(acceptedAt);
    this.acceptedByResponse.set(responseKey, responseFrames + 1);
    this.queue.push({ frame, acceptedAt, scheduledPlayoutAt: null, playedAt: null });
    this.counters.accepted++;
    this.queuedPeakFrames = Math.max(this.queuedPeakFrames, this.queue.length);
    if (!this.running) this.start();
    return { accepted: true, reason: null };
  }

  private recordArrivalBurst(at: number) {
    if (this.lastEnqueueAt !== null && at - this.lastEnqueueAt <= 5) {
      this.currentBurstFrames++;
    } else {
      if (this.currentBurstFrames > 1) this.burstSizes.push(this.currentBurstFrames);
      this.currentBurstFrames = 1;
    }
    this.lastEnqueueAt = at;
    if (this.burstSizes.length > 1000) this.burstSizes.shift();
  }

  private start() {
    const now = this.now();
    this.running = true;
    this.prebuffering = true;
    this.playoutEpoch = now + this.targetPrebufferMs;
    this.playoutIndex = 0;
    this.prebufferSamples.push(this.targetPrebufferMs);
    if (this.counters.pauses) this.counters.resumes++;
    this.schedule();
  }

  private schedule() {
    if (!this.running || this.timer) return;
    const deadline = this.playoutEpoch + this.playoutIndex * this.frameDurationMs;
    const delay = Math.max(0, deadline - this.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
    this.timer.unref?.();
  }

  private async tick() {
    if (!this.running) return;
    const deadline = this.playoutEpoch + this.playoutIndex * this.frameDurationMs;
    const startedAt = this.now();
    const lag = Math.max(0, startedAt - deadline);
    this.schedulerLags.push(lag);
    if (this.schedulerLags.length > 2000) this.schedulerLags.shift();
    if (lag > this.frameDurationMs) this.counters.late++;
    this.prebuffering = false;
    const owned = this.queue.shift();
    if (!owned) {
      this.counters.underruns++;
      this.counters.pauses++;
      this.stableFrames = 0;
      this.targetPrebufferMs = Math.min(this.maxPrebufferMs, this.targetPrebufferMs + this.frameDurationMs);
      this.running = false;
      return;
    }
    owned.scheduledPlayoutAt = deadline;
    await this.write(owned.frame);
    owned.playedAt = this.now();
    this.counters.played++;
    this.stableFrames++;
    if (this.stableFrames >= 500 && this.targetPrebufferMs > this.minPrebufferMs) {
      this.targetPrebufferMs -= this.frameDurationMs;
      this.stableFrames = 0;
    }
    if (this.lastWriteAt !== null) {
      this.gaps.push(Math.max(0, owned.playedAt - this.lastWriteAt));
      if (this.gaps.length > 2000) this.gaps.shift();
    }
    this.lastWriteAt = owned.playedAt;
    this.playoutIndex++;
    this.schedule();
  }

  clear(responseId?: string, reason: "barge_in" | "session_end" = "barge_in") {
    const removed: OwnedFrame[] = [];
    this.queue = this.queue.filter((owned) => {
      const matches = !responseId || owned.frame.responseId === responseId;
      if (matches) removed.push(owned);
      return !matches;
    });
    if (reason === "barge_in") this.counters.bargeIn += removed.length;
    else this.counters.sessionEnd += removed.length;
    if (!this.queue.length) {
      this.running = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    }
    return removed.length * this.frameDurationMs;
  }

  stop() {
    this.clear(undefined, "session_end");
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  metrics(): PlayoutMetrics {
    if (this.currentBurstFrames > 1) {
      const last = this.burstSizes.at(-1);
      if (last !== this.currentBurstFrames) this.burstSizes.push(this.currentBurstFrames);
    }
    const queuedMs = this.queue.length * this.frameDurationMs;
    const classified = this.counters.played + this.counters.bargeIn + this.counters.sessionEnd +
      this.counters.malformed + this.counters.responseLimit;
    return {
      initialPrebufferMs: this.initialPrebufferMs,
      adaptivePrebufferMs: this.targetPrebufferMs,
      prebufferMsCurrent: this.prebuffering ? Math.min(queuedMs, this.targetPrebufferMs) : 0,
      prebufferMsMin: this.prebufferSamples.length ? Math.min(...this.prebufferSamples) : this.targetPrebufferMs,
      prebufferMsAvg: average(this.prebufferSamples) ?? this.targetPrebufferMs,
      prebufferMsMax: this.prebufferSamples.length ? Math.max(...this.prebufferSamples) : this.targetPrebufferMs,
      bufferedAudioMs: queuedMs,
      queuedAudioMsCurrent: queuedMs,
      queuedAudioMsPeak: this.queuedPeakFrames * this.frameDurationMs,
      providerAudioFramesAccepted: this.counters.accepted,
      providerAudioDurationMsAccepted: this.counters.accepted * this.frameDurationMs,
      playoutFramesWritten: this.counters.played,
      playoutDurationMsWritten: this.counters.played * this.frameDurationMs,
      bargeInDiscardedFrames: this.counters.bargeIn,
      sessionEndDiscardedFrames: this.counters.sessionEnd,
      malformedRejectedFrames: this.counters.malformed,
      responseLimitRejectedFrames: this.counters.responseLimit,
      audioConservationMismatch: this.counters.accepted + this.counters.malformed + this.counters.responseLimit - classified - this.queue.length,
      playoutUnderruns: this.counters.underruns,
      playoutPauseCount: this.counters.pauses,
      playoutResumeCount: this.counters.resumes,
      outputBursts: this.burstSizes.length,
      realBurstEvents: this.burstSizes.length,
      framesPerBurstAvg: average(this.burstSizes),
      framesPerBurstP95: percentile(this.burstSizes, .95),
      framesPerBurstMax: this.burstSizes.length ? Math.max(...this.burstSizes) : null,
      schedulerLateFrames: this.counters.late,
      schedulerLagAvgMs: average(this.schedulerLags),
      schedulerLagP95Ms: percentile(this.schedulerLags, .95),
      schedulerLagMaxMs: this.schedulerLags.length ? Math.max(...this.schedulerLags) : null,
      lateFrames: this.counters.late,
      egressPacketGapAvgMs: average(this.gaps),
      egressPacketGapP95Ms: percentile(this.gaps, .95),
      egressPacketGapMaxMs: this.gaps.length ? Math.max(...this.gaps) : null,
      gapsOver40Ms: this.gaps.filter((value) => value > 40).length,
      gapsOver80Ms: this.gaps.filter((value) => value > 80).length,
      gapsOver120Ms: this.gaps.filter((value) => value > 120).length,
      gapsOver200Ms: this.gaps.filter((value) => value > 200).length,
      eventLoopLagP95Ms: percentile(this.schedulerLags, .95),
      eventLoopLagMaxMs: this.schedulerLags.length ? Math.max(...this.schedulerLags) : null,
    };
  }
}
