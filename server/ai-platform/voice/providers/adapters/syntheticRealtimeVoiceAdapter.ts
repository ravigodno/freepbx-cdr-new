import type { AudioFrame } from "../../media/mediaTypes.js";
import type { RealtimeVoiceProviderAdapter } from "../realtimeVoiceProviderAdapter.js";
import type {
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
} from "../realtimeVoiceTypes.js";
import { RealtimeVoiceError } from "../realtimeVoiceErrors.js";

export class SyntheticRealtimeVoiceAdapter implements RealtimeVoiceProviderAdapter {
  private handlers = new Set<
    (event: RealtimeVoiceEvent) => void | Promise<void>
  >();
  private config: RealtimeVoiceConfig | null = null;
  private state: "disconnected" | "connected" | "configured" | "responding" =
    "disconnected";
  private cancelled = false;
  private lastSource = "speech";
  getKey() {
    return "synthetic";
  }
  getCapabilities() {
    const pcm = {
      codec: "slin16" as const,
      sampleRate: 16000,
      channels: 1 as const,
      frameDurationMs: 20,
    };
    return {
      speechToSpeech: true,
      streamingInput: true,
      streamingOutput: true,
      serverVad: false,
      clientVad: true,
      interruption: true,
      tools: true,
      transcripts: true,
      multilingual: true,
      emotionControl: false,
      supportedInputFormats: [pcm],
      supportedOutputFormats: [pcm],
    };
  }
  validateConfig = async (config: RealtimeVoiceConfig) => ({
    valid: config.providerKey === "synthetic",
    errorCode:
      config.providerKey === "synthetic"
        ? undefined
        : "provider_not_configured",
  });
  async connect(config: RealtimeVoiceConfig, signal?: AbortSignal) {
    if (signal?.aborted)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Realtime connection cancelled",
      );
    this.config = config;
    this.state = "connected";
    await this.emit({
      type: "session_connected",
      providerSessionRef: "synthetic-session",
    });
  }
  async configureSession() {
    if (!this.config)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Synthetic provider is not connected",
      );
    this.state = "configured";
    await this.emit({ type: "session_configured" });
  }
  async appendAudio(frame: AudioFrame) {
    if (!this.config)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Synthetic provider is not connected",
      );
    this.lastSource = frame.source || "speech";
  }
  async commitInput() {
    if (!this.config)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Synthetic provider is not connected",
      );
    this.cancelled = false;
    await this.emit({ type: "input_audio_committed" });
    await this.emit({
      type: "transcript",
      kind: "input_final",
      text: this.transcript(),
    });
    if (this.cancelled) return;
    if (this.lastSource === "tool_query")
      await this.emit({
        type: "tool_call",
        toolKey: "pbx.get_active_calls",
        arguments: {},
        callId: "synthetic-tool-1",
      });
    if (this.cancelled) return;
    await this.respond(
      this.lastSource === "callback_request"
        ? "Могу зафиксировать просьбу о звонке после вашего согласия."
        : "Это synthetic голосовой ответ.",
    );
  }
  async startInitialGreeting(text: string) {
    if (!this.config || this.state !== "configured")
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Synthetic provider is not ready",
      );
    this.cancelled = false;
    await this.respond(text.slice(0, 160), "synthetic_greeting");
  }
  async cancelResponse() {
    this.cancelled = true;
    this.state = "configured";
    await this.emit({ type: "response_cancelled" });
  }
  async sendToolResult(callId: string, result: unknown) {
    if (!/^synthetic-tool-\d+$/.test(callId))
      throw new RealtimeVoiceError(
        "invalid_request",
        400,
        "Invalid synthetic tool call",
      );
    void result;
  }
  async close() {
    this.cancelled = true;
    this.state = "disconnected";
    this.config = null;
    this.handlers.clear();
  }
  getHealth() {
    return {
      state: (this.state === "disconnected" ? "disconnected" : "connected") as
        "disconnected" | "connected",
      failureCode: null,
      connectedAt:
        this.state === "disconnected" ? null : new Date().toISOString(),
    };
  }
  subscribeEvents(
    handler: (event: RealtimeVoiceEvent) => void | Promise<void>,
  ) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  private async emit(event: RealtimeVoiceEvent) {
    for (const handler of this.handlers) await handler(event);
  }
  private async respond(text: string, source = "synthetic_realtime") {
    if (!this.config) return;
    await this.emit({ type: "response_started" });
    this.state = "responding";
    const samples =
      (this.config.outputFormat.sampleRate *
        this.config.outputFormat.frameDurationMs) /
      1000;
    for (let sequence = 0; sequence < 3 && !this.cancelled; sequence++) {
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i++)
        pcm[i] = Math.round(
          2500 *
            Math.sin(
              (2 * Math.PI * 330 * (sequence * samples + i)) /
                this.config.outputFormat.sampleRate,
            ),
        );
      await this.emit({
        type: "output_audio",
        frame: {
          sequence,
          timestampMs: Date.now(),
          direction: "egress",
          codec: "slin16",
          sampleRate: this.config.outputFormat.sampleRate,
          channels: 1,
          durationMs: 20,
          payload: new Uint8Array(pcm.buffer),
          source,
          traceId: "synthetic",
          voiceSessionId: 0,
          mediaSessionId: 0,
        },
      });
    }
    if (!this.cancelled) {
      await this.emit({ type: "transcript", kind: "output_final", text });
      await this.emit({ type: "response_completed" });
    }
    this.state = "configured";
  }
  private transcript() {
    if (this.lastSource === "transfer_request")
      return "Соедините меня с человеком";
    if (this.lastSource === "callback_request") return "Перезвоните мне";
    if (this.lastSource === "tool_query")
      return "Есть ли сейчас активные звонки?";
    if (this.lastSource === "question") return "Подскажите информацию";
    return "Тестовая речь";
  }
}
