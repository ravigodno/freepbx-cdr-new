import type { AudioFrame } from "../media/mediaTypes.js";
import { assessSemanticCompletion } from "./realtimeResponseCompletion.js";

export type ResponseStreamState = {
  buffered: AudioFrame[];
  bufferedMs: number;
  framesSent: number;
  generatedMs: number;
  firstDeltaAt: number | null;
  startupBufferReadyAt: number | null;
  workerFirstBatchReceivedAt: number | null;
  providerDoneAt: number | null;
  warningReached: boolean;
  sentenceStopRequested: boolean;
  hardSafetyReached: boolean;
  playoutStarted: boolean;
};

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(min, Math.min(max, Math.round(numeric)))
    : fallback;
};

export function delayedStreamingPolicy(config: unknown) {
  const voice =
    config && typeof config === "object" && (config as any).voice
      ? (config as any).voice
      : {};
  return {
    startupBufferMs: clamp(voice.delayedPlayoutStartupMs, 500, 400, 600),
    warningMs: clamp(Number(voice.softResponseSeconds) * 1000, 5000, 4000, 8000),
    hardMs: clamp(Number(voice.maxResponseAudioSeconds) * 1000, 9000, 8000, 12000),
  };
}

export function createResponseStreamState(): ResponseStreamState {
  return {
    buffered: [],
    bufferedMs: 0,
    framesSent: 0,
    generatedMs: 0,
    firstDeltaAt: null,
    startupBufferReadyAt: null,
    workerFirstBatchReceivedAt: null,
    providerDoneAt: null,
    warningReached: false,
    sentenceStopRequested: false,
    hardSafetyReached: false,
    playoutStarted: false,
  };
}

export function pushResponseFrame(
  state: ResponseStreamState,
  frame: AudioFrame,
  startupBufferMs: number,
  now = performance.now(),
) {
  state.firstDeltaAt ??= now;
  state.generatedMs += frame.durationMs;
  if (state.framesSent > 0 && state.playoutStarted)
    return { release: [frame], startupReady: false };
  if (state.framesSent > 0) {
    state.buffered.push(frame);
    state.bufferedMs += frame.durationMs;
    return { release: [] as AudioFrame[], startupReady: false };
  }
  state.buffered.push(frame);
  state.bufferedMs += frame.durationMs;
  if (state.bufferedMs < startupBufferMs)
    return { release: [] as AudioFrame[], startupReady: false };
  state.startupBufferReadyAt ??= now;
  const release = state.buffered.splice(0);
  state.bufferedMs = 0;
  return { release, startupReady: true };
}

export function releaseAfterPlayoutStarted(state: ResponseStreamState) {
  state.playoutStarted = true;
  const release = state.buffered.splice(0);
  state.bufferedMs = 0;
  return release;
}

export function releaseResponseTail(
  state: ResponseStreamState,
  now = performance.now(),
) {
  state.providerDoneAt = now;
  if (state.startupBufferReadyAt === null)
    state.startupBufferReadyAt = now;
  const release = state.buffered.splice(0);
  state.bufferedMs = 0;
  return release;
}

export function mayRetryBeforePlayout(input: {
  providerStatus?: string;
  finishReason?: string;
  transcript: string;
  retryCount: number;
  framesSent: number;
}) {
  const semantic = assessSemanticCompletion(input.transcript);
  const tokenLimited =
    input.providerStatus === "incomplete" &&
    input.finishReason === "max_output_tokens";
  return {
    semantic,
    tokenLimited,
    retry:
      tokenLimited &&
      !semantic.complete &&
      input.retryCount === 0 &&
      input.framesSent === 0,
  };
}

export function sentenceBoundaryAfterWarning(
  state: ResponseStreamState,
  transcript: string,
  warningMs: number,
) {
  if (state.generatedMs < warningMs || state.sentenceStopRequested)
    return false;
  state.warningReached = true;
  if (!/[.!?…][»”"')\]]*\s*$/u.test(String(transcript || "").trim()))
    return false;
  state.sentenceStopRequested = true;
  return true;
}
