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

export type InterruptionRejectReason =
  | "not_audible"
  | "short_speech"
  | "echo"
  | "cooldown"
  | "acknowledgement_near_end"
  | "already_cancelled"
  | "transition_gap";

export type InterruptionDecision = {
  status: "candidate" | "confirmed" | "rejected";
  reason: string;
  cancelMode: "provider_and_playout" | "playout_only" | "no_cancel";
  fastPath: boolean;
};

export type VoiceTurnCoordinatorOptions = {
  minimumSpeechMs?: number;
  confirmationWindowMs?: number;
  energyThreshold?: number;
  playoutCooldownMs?: number;
  cancelCooldownMs?: number;
  remainingAudioCancelThresholdMs?: number;
};

const STOP_PHRASE =
  /(?:^|[\s,.!?;:—-])(стоп|подожди|перестань|другой\s+вопрос|хватит)(?=$|[\s,.!?;:—-])/iu;
const ACKNOWLEDGEMENT =
  /^\s*(да|угу|понятно|хорошо|нет)[.!?…,\s]*$/iu;

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
  private candidate: {
    startedAt: number;
    energy: number;
    echoSuspected: boolean;
  } | null = null;
  private playoutStartedAt = 0;
  private lastCancelAt = 0;
  private cancelledResponses = new Set<string>();
  counters = {
    interruptionCandidates: 0,
    rejectedShortSpeech: 0,
    rejectedEcho: 0,
    rejectedCooldown: 0,
    confirmedBargeInCount: 0,
    speechDuringPlaybackDetected: 0,
    cancelSentWhileGenerating: 0,
    localPlayoutCancelAfterProviderDone: 0,
    cancelSkippedProviderDone: 0,
    cancelNotActivePrevented: 0,
    duplicateResponsePrevented: 0,
  };
  lastDecision: InterruptionDecision | null = null;

  constructor(options: VoiceTurnCoordinatorOptions = {}) {
    this.options = {
      minimumSpeechMs: options.minimumSpeechMs ?? 220,
      confirmationWindowMs: options.confirmationWindowMs ?? 160,
      energyThreshold: options.energyThreshold ?? 700,
      playoutCooldownMs: options.playoutCooldownMs ?? 250,
      cancelCooldownMs: options.cancelCooldownMs ?? 300,
      remainingAudioCancelThresholdMs:
        options.remainingAudioCancelThresholdMs ?? 1000,
    };
  }

  callerSpeechStarted(
    input: { energy: number; echoSuspected?: boolean },
    now = Date.now(),
  ): InterruptionDecision {
    this.state = "caller_speaking";
    if (!this.audibleActive || !this.activeResponseRef)
      return this.reject("not_audible");
    this.counters.speechDuringPlaybackDetected++;
    if (this.cancelledResponses.has(this.activeResponseRef))
      return this.reject("already_cancelled");
    if (now - this.playoutStartedAt < this.options.playoutCooldownMs)
      return this.reject("cooldown");
    if (now - this.lastCancelAt < this.options.cancelCooldownMs)
      return this.reject("cooldown");
    if (input.energy < this.options.energyThreshold)
      return this.reject("short_speech");
    if (input.echoSuspected) return this.reject("echo");
    this.candidate = {
      startedAt: now,
      energy: input.energy,
      echoSuspected: Boolean(input.echoSuspected),
    };
    this.counters.interruptionCandidates++;
    this.state = "interruption_candidate";
    return this.remember({
      status: "candidate",
      reason: "sustained_speech_required",
      cancelMode: "no_cancel",
      fastPath: false,
    });
  }

  evaluateCandidate(
    now = Date.now(),
    transcript = "",
  ): InterruptionDecision {
    if (!this.candidate) return this.reject("transition_gap");
    const duration = now - this.candidate.startedAt;
    if (STOP_PHRASE.test(transcript))
      return this.confirm("stop_phrase", true, now);
    if (
      ACKNOWLEDGEMENT.test(transcript) &&
      this.queuedAudioRemainingMs <=
        this.options.remainingAudioCancelThresholdMs
    )
      return this.reject("acknowledgement_near_end");
    const required = Math.max(
      this.options.minimumSpeechMs,
      this.options.confirmationWindowMs,
    );
    if (duration < required) return this.reject("short_speech");
    return this.confirm("sustained_speech", false, now);
  }

  callerSpeechEnded(now = Date.now(), transcript = "") {
    const decision = this.candidate
      ? this.evaluateCandidate(now, transcript)
      : null;
    this.candidate = null;
    if (decision?.status !== "confirmed") this.state = "caller_speaking";
    return decision;
  }

  transcriptPartial(text: string, now = Date.now()) {
    if (STOP_PHRASE.test(text) && this.candidate)
      return this.confirm("stop_phrase", true, now);
    if (
      ACKNOWLEDGEMENT.test(text) &&
      this.candidate &&
      this.queuedAudioRemainingMs <=
        this.options.remainingAudioCancelThresholdMs
    )
      return this.reject("acknowledgement_near_end");
    return this.lastDecision;
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
    this.queuedAudioRemainingMs = Math.max(
      0,
      Number(input.queuedAudioMs || 0),
    );
    this.playoutStartedAt = input.now ?? Date.now();
    this.state = "ai_speaking";
  }

  updateQueuedAudio(ms: number) {
    this.queuedAudioRemainingMs = Math.max(0, Number(ms) || 0);
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
    return this.confirm(reason, true, now);
  }

  snapshot() {
    return {
      state: this.state,
      providerState: this.providerState,
      audibleActive: this.audibleActive,
      queuedAudioRemainingMs: this.queuedAudioRemainingMs,
      callerTurnRef: this.callerTurnRef,
      lastDecision: this.lastDecision,
      ...this.counters,
    };
  }

  private confirm(
    reason: string,
    fastPath: boolean,
    now: number,
  ): InterruptionDecision {
    if (!this.audibleActive || !this.activeResponseRef)
      return this.reject("not_audible");
    if (this.cancelledResponses.has(this.activeResponseRef))
      return this.reject("already_cancelled");
    this.cancelledResponses.add(this.activeResponseRef);
    this.lastCancelAt = now;
    this.candidate = null;
    this.state = "interruption_confirmed";
    this.counters.confirmedBargeInCount++;
    let cancelMode: InterruptionDecision["cancelMode"] = "no_cancel";
    if (this.providerState === "generating") {
      cancelMode = "provider_and_playout";
      this.counters.cancelSentWhileGenerating++;
    } else if (this.providerState === "provider_done") {
      cancelMode = "playout_only";
      this.counters.localPlayoutCancelAfterProviderDone++;
      this.counters.cancelSkippedProviderDone++;
      this.counters.cancelNotActivePrevented++;
    } else {
      cancelMode = "playout_only";
      this.counters.cancelNotActivePrevented++;
    }
    return this.remember({
      status: "confirmed",
      reason,
      cancelMode,
      fastPath,
    });
  }

  private reject(reason: InterruptionRejectReason): InterruptionDecision {
    if (reason === "short_speech") this.counters.rejectedShortSpeech++;
    if (reason === "echo") this.counters.rejectedEcho++;
    if (reason === "cooldown") this.counters.rejectedCooldown++;
    this.candidate = null;
    return this.remember({
      status: "rejected",
      reason,
      cancelMode: "no_cancel",
      fastPath: false,
    });
  }

  private remember(decision: InterruptionDecision) {
    this.lastDecision = decision;
    return decision;
  }
}
