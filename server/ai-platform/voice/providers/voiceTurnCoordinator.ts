export type VoiceTurnState =
  | "listening"
  | "caller_speaking"
  | "waiting_for_provider"
  | "provider_generating"
  | "playout_buffering"
  | "ai_speaking"
  | "interruption_candidate"
  | "interruption_confirmed"
  | "cancelling_playout"
  | "post_interrupt_listening"
  | "call_ending";

export type ProviderTurnState =
  | "idle"
  | "generating"
  | "provider_done"
  | "cancelled"
  | "failed"
  | "unknown";

export type CallerSpeechCategory =
  | "acknowledgement"
  | "laughter"
  | "cough"
  | "breath"
  | "noise"
  | "substantive_speech"
  | "explicit_stop_command"
  | "unknown";

export type InterruptionDecision = {
  status: "candidate" | "confirmed" | "rejected";
  reason: string;
  category: CallerSpeechCategory;
  cancelMode: "provider_and_playout" | "playout_only" | "no_cancel";
  fastPath: boolean;
  idempotencyKey?: string;
  responseRef?: string;
  callerTurnRef?: number;
  keyword?: string;
  semanticRemainder?: string;
  detectedAt?: number;
};

export type VoiceTurnCoordinatorOptions = {
  sessionRef?: string;
  substantiveSpeechMs?: number;
  minimumSubstantiveWords?: number;
  remainingAudioCancelThresholdMs?: number;
  playoutCooldownMs?: number;
  cancelCooldownMs?: number;
};

const STOP_COMMAND =
  /(?:^|[\s,.!?;:—-])(стоп|подожди|погоди|хватит|перестань|другой\s+вопрос|замолчи)(?=$|[\s,.!?;:—-])/iu;
const STOP_PREFIX =
  /^\s*(?:(?:стоп|подожди|погоди|хватит|перестань|другой\s+вопрос|замолчи)\s*[,;:—-]?\s*)+/iu;
const ACKNOWLEDGEMENT =
  /^\s*(?:да|угу|ага|хорошо|понятно|ясно|ладно|мм+|мг+|окей|ок)\s*[.!?…,\s]*$/iu;
const LAUGHTER =
  /^\s*(?:ха(?:-?ха)+|хе(?:-?хе)+|сме[её]тся|смех|laugh(?:ter)?)\s*[.!?…,\s]*$/iu;
const COUGH = /^\s*(?:кхм+|кашель|кашляет|cough)\s*[.!?…,\s]*$/iu;
const BREATH = /^\s*(?:вдох|выдох|вздох|дышит|breath)\s*[.!?…,\s]*$/iu;
const NOISE = /^\s*(?:шум|щелчок|треск|noise)\s*[.!?…,\s]*$/iu;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}-]*/gu;

export const extractStopCommand = (text: string) => {
  const match = STOP_COMMAND.exec(text);
  if (!match) return null;
  const prefix = STOP_PREFIX.exec(text);
  return {
    keyword: String(match[1]).toLocaleLowerCase("ru"),
    semanticRemainder: prefix
      ? text.slice(prefix[0].length).replace(/^[\s,.!?;:—-]+/u, "").trim()
      : "",
  };
};

export function classifyCallerSpeech(text: string): CallerSpeechCategory {
  const normalized = text.trim();
  if (!normalized) return "unknown";
  if (extractStopCommand(normalized)) return "explicit_stop_command";
  if (ACKNOWLEDGEMENT.test(normalized)) return "acknowledgement";
  if (LAUGHTER.test(normalized)) return "laughter";
  if (COUGH.test(normalized)) return "cough";
  if (BREATH.test(normalized)) return "breath";
  if (NOISE.test(normalized)) return "noise";
  return (normalized.match(WORD) || []).length >= 2
    ? "substantive_speech"
    : "unknown";
}

export class VoiceTurnCoordinator {
  readonly options: Required<VoiceTurnCoordinatorOptions>;
  state: VoiceTurnState = "listening";
  providerState: ProviderTurnState = "idle";
  audibleActive = false;
  queuedAudioRemainingMs = 0;
  activeResponseRef: string | null = null;
  activeItemRef: string | null = null;
  callerTurnRef = 0;
  private responseCreatedForTurn = false;
  private candidate: { startedAt: number; category: CallerSpeechCategory } | null =
    null;
  private playoutStartedAt = 0;
  private lastCancelAt = 0;
  private confirmedKeys = new Set<string>();
  private categoryCountedForTurn = new Set<CallerSpeechCategory>();
  private candidateRecords: Array<Record<string, unknown>> = [];
  counters = {
    interruptionCandidates: 0,
    rejectedShortSpeech: 0,
    rejectedEcho: 0,
    rejectedCooldown: 0,
    rejectedAcknowledgement: 0,
    rejectedNonverbal: 0,
    rejectedInsufficientWords: 0,
    rejectedRemainingAudio: 0,
    confirmedBargeInCount: 0,
    speechDuringPlaybackDetected: 0,
    cancelSentWhileGenerating: 0,
    localPlayoutCancelAfterProviderDone: 0,
    cancelSkippedProviderDone: 0,
    cancelNotActivePrevented: 0,
    duplicateResponsePrevented: 0,
    duplicateInterruptionPrevented: 0,
    acknowledgementCount: 0,
    laughterCount: 0,
    coughCount: 0,
    breathCount: 0,
    noiseCount: 0,
    substantiveSpeechCount: 0,
    explicitStopCommandCount: 0,
  };
  lastDecision: InterruptionDecision | null = null;
  lastStopTelemetry: {
    keyword: string;
    partialDetectedAt: number;
    semanticRemainderPresent: boolean;
  } | null = null;

  constructor(options: VoiceTurnCoordinatorOptions = {}) {
    this.options = {
      sessionRef: options.sessionRef || "session",
      substantiveSpeechMs: options.substantiveSpeechMs ?? 500,
      minimumSubstantiveWords: options.minimumSubstantiveWords ?? 2,
      remainingAudioCancelThresholdMs:
        options.remainingAudioCancelThresholdMs ?? 1500,
      playoutCooldownMs: options.playoutCooldownMs ?? 250,
      cancelCooldownMs: options.cancelCooldownMs ?? 300,
    };
  }

  callerSpeechStarted(
    _input: { energy: number; echoSuspected?: boolean },
    now = Date.now(),
  ): InterruptionDecision {
    this.state = "caller_speaking";
    if (!this.audibleActive || !this.activeResponseRef)
      return this.reject("not_audible", "unknown", false);
    this.counters.speechDuringPlaybackDetected++;
    const key = this.key();
    if (this.confirmedKeys.has(key)) {
      this.counters.duplicateInterruptionPrevented++;
      return this.reject("already_cancelled", "unknown", false);
    }
    if (
      now - this.playoutStartedAt < this.options.playoutCooldownMs ||
      now - this.lastCancelAt < this.options.cancelCooldownMs
    ) {
      this.counters.rejectedCooldown++;
      return this.reject("cooldown", "unknown", false);
    }
    this.candidate = { startedAt: now, category: "unknown" };
    this.counters.interruptionCandidates++;
    this.state = "interruption_candidate";
    this.recordCandidate("candidate", "transcript_confirmation_required", "unknown", now);
    return this.remember({
      status: "candidate",
      reason: "transcript_confirmation_required",
      category: "unknown",
      cancelMode: "no_cancel",
      fastPath: false,
    });
  }

  transcriptPartial(text: string, now = Date.now()): InterruptionDecision {
    if (
      this.audibleActive &&
      this.activeResponseRef &&
      this.confirmedKeys.has(this.key())
    ) {
      this.counters.duplicateInterruptionPrevented++;
      return this.reject("already_cancelled", "unknown", false);
    }
    if (!this.candidate || !this.audibleActive || !this.activeResponseRef)
      return this.reject("transition_gap", "unknown", false);
    const category = classifyCallerSpeech(text);
    this.candidate.category = category;
    this.countCategory(category);
    const stop = extractStopCommand(text);
    if (stop) {
      this.lastStopTelemetry = {
        keyword: stop.keyword,
        partialDetectedAt: now,
        semanticRemainderPresent: Boolean(stop.semanticRemainder),
      };
      return this.confirm(
        "stop_phrase",
        category,
        true,
        now,
        stop.keyword,
        stop.semanticRemainder,
      );
    }
    if (category === "acknowledgement") {
      this.counters.rejectedAcknowledgement++;
      return this.reject("acknowledgement", category, false);
    }
    if (["laughter", "cough", "breath", "noise"].includes(category)) {
      this.counters.rejectedNonverbal++;
      return this.reject("nonverbal", category, false);
    }
    const words = (text.match(WORD) || []).length;
    if (category !== "substantive_speech" || words < this.options.minimumSubstantiveWords) {
      this.counters.rejectedInsufficientWords++;
      return this.reject("insufficient_words", category, false);
    }
    if (now - this.candidate.startedAt < this.options.substantiveSpeechMs) {
      this.counters.rejectedShortSpeech++;
      return this.reject("short_speech", category, false);
    }
    if (
      this.queuedAudioRemainingMs <=
      this.options.remainingAudioCancelThresholdMs
    ) {
      this.counters.rejectedRemainingAudio++;
      return this.reject("remaining_audio_low", category, false);
    }
    return this.confirm("substantive_speech", category, false, now);
  }

  callerSpeechEnded(now = Date.now()) {
    if (!this.candidate) return null;
    const category = this.candidate.category;
    this.candidate = null;
    this.state = "caller_speaking";
    const decision = this.reject(
      category === "unknown" ? "no_transcript_confirmation" : "candidate_ended",
      category,
      true,
    );
    this.recordCandidate("rejected", decision.reason, category, now);
    return decision;
  }

  providerResponseStarted(responseRef?: string) {
    this.providerState = "generating";
    this.activeResponseRef = responseRef || this.activeResponseRef;
    this.state = "provider_generating";
  }

  providerResponseDone(responseRef?: string) {
    if (!responseRef || responseRef === this.activeResponseRef)
      this.providerState = "provider_done";
    if (this.audibleActive) this.state = "ai_speaking";
  }

  providerResponseCancelled(responseRef?: string) {
    if (!responseRef || responseRef === this.activeResponseRef)
      this.providerState = "cancelled";
  }

  providerResponseFailed() {
    this.providerState = "failed";
  }

  playoutStarted(input: {
    responseRef?: string;
    itemRef?: string;
    queuedAudioMs?: number;
    now?: number;
  }) {
    this.audibleActive = true;
    this.activeResponseRef = input.responseRef || this.activeResponseRef;
    this.activeItemRef = input.itemRef || this.activeItemRef;
    this.queuedAudioRemainingMs = Math.max(0, Number(input.queuedAudioMs || 0));
    this.playoutStartedAt = input.now ?? Date.now();
    this.state = "ai_speaking";
  }

  updateQueuedAudio(ms: number) {
    this.queuedAudioRemainingMs = Math.max(0, Number(ms) || 0);
  }

  markCancellationStarted() {
    this.state = "cancelling_playout";
  }

  markCancellationCompleted() {
    this.state = "post_interrupt_listening";
  }

  playoutFinished(interrupted: boolean) {
    this.audibleActive = false;
    this.queuedAudioRemainingMs = 0;
    this.activeResponseRef = null;
    this.activeItemRef = null;
    this.candidate = null;
    this.state = interrupted ? "post_interrupt_listening" : "listening";
    if (!interrupted) this.providerState = "idle";
  }

  beginCallerTurn() {
    this.callerTurnRef++;
    this.responseCreatedForTurn = false;
    this.categoryCountedForTurn.clear();
    this.state = "caller_speaking";
    return this.callerTurnRef;
  }

  requestResponseForTurn() {
    if (this.responseCreatedForTurn) {
      this.counters.duplicateResponsePrevented++;
      return false;
    }
    this.responseCreatedForTurn = true;
    this.state = "waiting_for_provider";
    return true;
  }

  callEnding() {
    this.state = "call_ending";
  }

  forceInterruption(reason = "explicit_request", now = Date.now()) {
    return this.confirm(reason, "explicit_stop_command", true, now);
  }

  snapshot() {
    return {
      state: this.state,
      providerState: this.providerState,
      audibleActive: this.audibleActive,
      queuedAudioRemainingMs: this.queuedAudioRemainingMs,
      callerTurnRef: this.callerTurnRef,
      lastDecision: this.lastDecision,
      lastStopTelemetry: this.lastStopTelemetry,
      candidateRecords: this.candidateRecords,
      ...this.counters,
    };
  }

  private key() {
    return `${this.options.sessionRef}:${this.activeResponseRef || "none"}:${this.callerTurnRef}`;
  }

  private confirm(
    reason: string,
    category: CallerSpeechCategory,
    fastPath: boolean,
    now: number,
    keyword?: string,
    semanticRemainder?: string,
  ): InterruptionDecision {
    if (!this.audibleActive || !this.activeResponseRef)
      return this.reject("not_audible", category, false);
    const idempotencyKey = this.key();
    if (this.confirmedKeys.has(idempotencyKey)) {
      this.counters.duplicateInterruptionPrevented++;
      return this.reject("already_cancelled", category, false);
    }
    this.confirmedKeys.add(idempotencyKey);
    this.lastCancelAt = now;
    this.candidate = null;
    this.state = "interruption_confirmed";
    this.counters.confirmedBargeInCount++;
    let cancelMode: InterruptionDecision["cancelMode"] = "playout_only";
    if (this.providerState === "generating") {
      cancelMode = "provider_and_playout";
      this.counters.cancelSentWhileGenerating++;
    } else if (this.providerState === "provider_done") {
      this.counters.localPlayoutCancelAfterProviderDone++;
      this.counters.cancelSkippedProviderDone++;
      this.counters.cancelNotActivePrevented++;
    } else {
      this.counters.cancelNotActivePrevented++;
    }
    this.recordCandidate("confirmed", reason, category, now);
    return this.remember({
      status: "confirmed",
      reason,
      category,
      cancelMode,
      fastPath,
      idempotencyKey,
      responseRef: this.activeResponseRef,
      callerTurnRef: this.callerTurnRef,
      keyword,
      semanticRemainder,
      detectedAt: now,
    });
  }

  private reject(
    reason: string,
    category: CallerSpeechCategory,
    keepCandidate: boolean,
  ): InterruptionDecision {
    if (!keepCandidate) this.candidate = null;
    return this.remember({
      status: "rejected",
      reason,
      category,
      cancelMode: "no_cancel",
      fastPath: false,
    });
  }

  private countCategory(category: CallerSpeechCategory) {
    if (this.categoryCountedForTurn.has(category)) return;
    this.categoryCountedForTurn.add(category);
    if (category === "acknowledgement") this.counters.acknowledgementCount++;
    if (category === "laughter") this.counters.laughterCount++;
    if (category === "cough") this.counters.coughCount++;
    if (category === "breath") this.counters.breathCount++;
    if (category === "noise") this.counters.noiseCount++;
    if (category === "substantive_speech")
      this.counters.substantiveSpeechCount++;
    if (category === "explicit_stop_command")
      this.counters.explicitStopCommandCount++;
  }

  private recordCandidate(
    status: string,
    reason: string,
    category: CallerSpeechCategory,
    now: number,
  ) {
    this.candidateRecords.push({
      callerTurnRef: this.callerTurnRef,
      status,
      reason,
      category,
      remainingAudioMs: this.queuedAudioRemainingMs,
      timestamp: now,
    });
    if (this.candidateRecords.length > 50) this.candidateRecords.shift();
  }

  private remember(decision: InterruptionDecision) {
    this.lastDecision = decision;
    return decision;
  }
}
