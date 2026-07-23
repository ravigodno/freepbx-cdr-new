import { createRequire } from "module";
import type { AudioFrame } from "../../media/mediaTypes.js";
import { AudioPacketizer } from "../../media/audioPacketizer.js";
import { AudioResampler } from "../../media/audioResampler.js";
import { encodePcm16ToUlaw } from "../../media/g711.js";
import type { RealtimeVoiceProviderAdapter } from "../realtimeVoiceProviderAdapter.js";
import type {
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
} from "../realtimeVoiceTypes.js";
import { RealtimeVoiceError } from "../realtimeVoiceErrors.js";
import { normalizeOpenAIRealtimeEvent } from "../realtimeVoiceEventNormalizer.js";

const PROVIDER_SAMPLE_RATE = 24000;
const INTERNAL_SAMPLE_RATE = 16000;
const MAX_PACKETIZER_CHUNK_MS = 200;
const PCM16_BYTES_PER_SAMPLE = 2;
const ULAW_FRAME_BYTES = 160;

export function splitOpenAIOutputAudio(payload: Buffer) {
  const maxChunkBytes =
    (PROVIDER_SAMPLE_RATE * MAX_PACKETIZER_CHUNK_MS * PCM16_BYTES_PER_SAMPLE) /
    1000;
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < payload.length; offset += maxChunkBytes)
    chunks.push(payload.subarray(offset, offset + maxChunkBytes));
  return chunks;
}

export function readOpenAIRealtimeConfig() {
  const apiKey = process.env.OPENAI_API_KEY || "",
    url =
      process.env.PBXPULS_OPENAI_REALTIME_URL ||
      "wss://api.openai.com/v1/realtime",
    model = process.env.PBXPULS_OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
  return { configured: Boolean(apiKey), apiKey, url, model };
}

export class OpenAIRealtimeAdapter implements RealtimeVoiceProviderAdapter {
  private socket: any = null;
  private handlers = new Set<
    (event: RealtimeVoiceEvent) => void | Promise<void>
  >();
  private config: RealtimeVoiceConfig | null = null;
  private health: {
    state:
      "not_configured" | "disconnected" | "connecting" | "connected" | "failed";
    failureCode: string | null;
    connectedAt: string | null;
  } = { state: "disconnected", failureCode: null, connectedAt: null };
  private readonly resampler = new AudioResampler();
  private readonly outputPacketizer = new AudioPacketizer();
  private ulawOutputRemainder = Buffer.alloc(0);
  private ulawOutputSequence = 0;
  private providerOutputArrivals: number[] = [];
  private providerOutputGaps: number[] = [];
  private providerOutputBursts = 0;
  private providerEventSequence = 0;
  private pendingConfiguration: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  getKey() {
    return "openai_realtime";
  }
  getCapabilities() {
    const pcm = {
      codec: "slin16" as const,
      sampleRate: INTERNAL_SAMPLE_RATE,
      channels: 1 as const,
      frameDurationMs: 20,
    };
    return {
      speechToSpeech: true,
      streamingInput: true,
      streamingOutput: true,
      serverVad: true,
      clientVad: true,
      interruption: true,
      tools: false,
      transcripts: true,
      multilingual: true,
      emotionControl: false,
      supportedInputFormats: [
        pcm,
        { codec: "slin16" as const, sampleRate: 8000, channels: 1 as const, frameDurationMs: 20 },
      ],
      supportedOutputFormats: [
        pcm,
        { codec: "ulaw" as const, sampleRate: 8000, channels: 1 as const, frameDurationMs: 20 },
      ],
    };
  }
  async validateConfig(config: RealtimeVoiceConfig) {
    return {
      valid: Boolean(config.apiKey && config.url && config.model),
      errorCode: config.apiKey ? undefined : "provider_not_configured",
    };
  }
  async connect(config: RealtimeVoiceConfig, signal?: AbortSignal) {
    if (!(await this.validateConfig(config)).valid)
      throw new RealtimeVoiceError(
        "provider_not_configured",
        503,
        "Realtime provider is not configured",
      );
    if (!/^wss:\/\/api\.openai\.com\//.test(String(config.url)))
      throw new RealtimeVoiceError(
        "invalid_request",
        400,
        "Realtime provider URL is not allowlisted",
      );
    let WebSocketClient: any;
    try {
      WebSocketClient = createRequire(`${process.cwd()}/package.json`)("ws");
    } catch {
      throw new RealtimeVoiceError(
        "provider_not_configured",
        503,
        "Secure WebSocket transport is unavailable",
      );
    }
    this.config = config;
    this.outputPacketizer.reset();
    this.ulawOutputRemainder = Buffer.alloc(0);
    this.ulawOutputSequence = 0;
    this.providerOutputArrivals = [];
    this.providerOutputGaps = [];
    this.providerOutputBursts = 0;
    this.providerEventSequence = 0;
    this.health = { state: "connecting", failureCode: null, connectedAt: null };
    const url = new URL(config.url!);
    url.searchParams.set("model", String(config.model));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocketClient(url, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      this.socket = socket;
      const timer = setTimeout(() => {
        socket.close();
        reject(
          new RealtimeVoiceError(
            "provider_not_configured",
            504,
            "Realtime provider connection timed out",
          ),
        );
      }, config.timeoutMs);
      const abort = () => {
        socket.close();
        if (!settled)
          reject(
            new RealtimeVoiceError(
              "conflict",
              409,
              "Realtime provider connection cancelled",
            ),
          );
      };
      signal?.addEventListener("abort", abort, { once: true });
      socket.on("open", () => {
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.health = {
          state: "connected",
          failureCode: null,
          connectedAt: new Date().toISOString(),
        };
        resolve();
      });
      socket.on("error", () => {
        this.health = {
          state: "failed",
          failureCode: "provider_connection_failed",
          connectedAt: null,
        };
        if (!settled) {
          clearTimeout(timer);
          reject(
            new RealtimeVoiceError(
              "provider_not_configured",
              502,
              "Realtime provider connection failed",
            ),
          );
        }
      });
      socket.on("message", (data: unknown) => {
        try {
          const raw = JSON.parse(String(data));
          if (
            ["response.output_audio.delta", "response.audio.delta"].includes(
              String(raw?.type),
            ) &&
            typeof raw?.delta === "string"
          ) {
            const arrivedAt = performance.now(),
              previous = this.providerOutputArrivals.at(-1);
            if (previous !== undefined) {
              const gap = Math.max(0, arrivedAt - previous);
              this.providerOutputGaps.push(gap);
              if (gap < 10) this.providerOutputBursts++;
              if (this.providerOutputGaps.length > 2000)
                this.providerOutputGaps.shift();
            }
            this.providerOutputArrivals.push(arrivedAt);
            if (this.providerOutputArrivals.length > 2000)
              this.providerOutputArrivals.shift();
            const responseId =
                String(raw?.response_id || "").slice(0, 191) || undefined,
              itemId = String(raw?.item_id || "").slice(0, 191) || undefined,
              contentIndex = Number.isInteger(raw?.content_index)
                ? Number(raw.content_index)
                : 0,
              providerEventSequence = this.providerEventSequence++,
              deltaBytes = Buffer.byteLength(raw.delta, "base64");
            if (this.config?.outputFormat.codec === "ulaw") {
              this.ulawOutputRemainder = Buffer.concat([
                this.ulawOutputRemainder,
                Buffer.from(raw.delta, "base64"),
              ]);
              while (this.ulawOutputRemainder.length >= ULAW_FRAME_BYTES) {
                const payload = this.ulawOutputRemainder.subarray(0, ULAW_FRAME_BYTES);
                this.ulawOutputRemainder = this.ulawOutputRemainder.subarray(ULAW_FRAME_BYTES);
                void this.emit({
                  type: "output_audio",
                  frame: {
                    sequence: this.ulawOutputSequence++,
                    timestampMs: Date.now(),
                    direction: "egress",
                    codec: "ulaw",
                    sampleRate: 8000,
                    channels: 1,
                    durationMs: 20,
                    payload,
                    source: "openai_realtime",
                    traceId: "provider",
                    voiceSessionId: 0,
                    mediaSessionId: 0,
                    responseId,
                    providerItemId: itemId,
                    providerArrivedAtMs: Date.now(),
                    providerDeltaBytes: deltaBytes,
                    providerEventSequence,
                    contentIndex,
                  },
                });
              }
              return;
            }
            for (const chunk of splitOpenAIOutputAudio(
              Buffer.from(raw.delta, "base64"),
            )) {
              const frames = this.outputPacketizer.pushPcm(
                chunk,
                {
                  codec: "slin16",
                  sampleRate: PROVIDER_SAMPLE_RATE,
                  channels: 1,
                },
                Date.now(),
                {
                  source: "openai_realtime",
                  traceId: "provider",
                  voiceSessionId: 0,
                  mediaSessionId: 0,
                },
              );
              for (const frame of frames)
                void this.emit({
                  type: "output_audio",
                  frame: {
                    ...frame,
                    responseId,
                    providerItemId: itemId,
                    providerArrivedAtMs: Date.now(),
                    providerDeltaBytes: deltaBytes,
                    providerEventSequence,
                    contentIndex,
                  },
                  responseId,
                  itemId,
                });
            }
            return;
          }
          const normalized = normalizeOpenAIRealtimeEvent(raw, (payload) => ({
            sequence: 0,
            timestampMs: Date.now(),
            direction: "egress",
            codec: "slin16",
            sampleRate: INTERNAL_SAMPLE_RATE,
            channels: 1,
            durationMs: 20,
            payload,
            source: "openai_realtime",
            traceId: "provider",
            voiceSessionId: 0,
            mediaSessionId: 0,
          }));
          if (normalized?.type === "session_configured")
            this.settleConfiguration();
          if (normalized?.type === "error")
            this.settleConfiguration(
              new RealtimeVoiceError(
                normalized.errorCode,
                502,
                "Realtime session configuration was rejected",
              ),
            );
          if (normalized) void this.emit(normalized);
        } catch {}
      });
      socket.on("close", () => {
        this.settleConfiguration(
          new RealtimeVoiceError(
            "provider_connection_failed",
            502,
            "Realtime provider closed during configuration",
          ),
        );
        this.outputPacketizer.flush();
        this.socket = null;
        this.health = {
          state: "disconnected",
          failureCode: null,
          connectedAt: null,
        };
      });
    });
  }
  async configureSession(config: RealtimeVoiceConfig) {
    if (this.pendingConfiguration)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Realtime session configuration is already pending",
      );
    const configured = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.settleConfiguration(
            new RealtimeVoiceError(
              "provider_timeout",
              504,
              "Realtime session configuration timed out",
            ),
          ),
        config.timeoutMs,
      );
      this.pendingConfiguration = { resolve, reject, timer };
    });
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        model: config.model,
        instructions: config.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format:
              config.inputFormat.sampleRate === 8000
                ? { type: "audio/pcmu" }
                : { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            noise_reduction: { type: "near_field" },
            transcription: {
              model: "gpt-4o-transcribe",
              language: config.language.split("-")[0] || "ru",
            },
            turn_detection: config.serverVad ? { type: "server_vad" } : null,
          },
          output: {
            format:
              config.outputFormat.codec === "ulaw"
                ? { type: "audio/pcmu" }
                : { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            voice: config.voice || "marin",
          },
        },
      },
    });
    return configured;
  }
  async appendAudio(frame: AudioFrame) {
    if (frame.codec !== "slin16" || frame.channels !== 1)
      throw new RealtimeVoiceError(
        "unsupported_codec",
        400,
        "Realtime input format is unsupported",
      );
    const input = decodePcm16(frame.payload),
      providerAudio =
        frame.sampleRate === 8000
          ? Buffer.from(encodePcm16ToUlaw(input))
          : encodePcm16(
              this.resampler.resamplePcm16(
                input,
                frame.sampleRate,
                PROVIDER_SAMPLE_RATE,
              ),
            );
    this.send({
      type: "input_audio_buffer.append",
      audio: providerAudio.toString("base64"),
    });
  }
  async commitInput() {
    this.send({ type: "input_audio_buffer.commit" });
  }
  async createResponse() {
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Отвечай только на русском языке. Перейди на другой язык только после явной просьбы клиента.",
      },
    });
  }
  async createRussianCorrection() {
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Предыдущий ответ не озвучивай. Ответь заново естественно и только по-русски.",
      },
    });
  }
  async startInitialGreeting(text: string) {
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: `Say exactly this greeting in Russian: ${text}`,
      },
    });
  }
  async cancelResponse(responseId?: string) {
    this.send({
      type: "response.cancel",
      ...(responseId ? { response_id: responseId } : {}),
    });
  }
  async truncateResponse(itemId: string, audioEndMs: number) {
    if (!itemId || !Number.isFinite(audioEndMs)) return;
    this.send({
      type: "conversation.item.truncate",
      item_id: itemId,
      content_index: 0,
      audio_end_ms: Math.max(0, Math.floor(audioEndMs)),
    });
  }
  async sendToolResult() {
    throw new RealtimeVoiceError(
      "permission_denied",
      403,
      "External realtime tools are disabled",
    );
  }
  async close() {
    this.settleConfiguration(
      new RealtimeVoiceError(
        "provider_connection_failed",
        502,
        "Realtime provider closed during configuration",
      ),
    );
    this.socket?.close();
    this.socket = null;
    this.config = null;
    this.outputPacketizer.flush();
    this.health = {
      state: "disconnected",
      failureCode: null,
      connectedAt: null,
    };
  }
  getHealth() {
    return { ...this.health };
  }
  getOutputMetrics() {
    const sorted = [...this.providerOutputGaps].sort((a, b) => a - b),
      avg = sorted.length
        ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
        : null;
    return {
      providerOutputGapAvgMs: avg,
      providerOutputGapP95Ms: sorted.length
        ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
        : null,
      providerOutputGapMaxMs: sorted.length ? sorted.at(-1)! : null,
      providerOutputPauses: sorted.filter((value) => value > 120).length,
      providerOutputBursts: this.providerOutputBursts,
    };
  }
  subscribeEvents(
    handler: (event: RealtimeVoiceEvent) => void | Promise<void>,
  ) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  private send(value: unknown) {
    if (!this.socket || this.socket.readyState !== 1)
      throw new RealtimeVoiceError(
        "provider_not_configured",
        503,
        "Realtime provider is not connected",
      );
    this.socket.send(JSON.stringify(value));
  }
  private async emit(event: RealtimeVoiceEvent) {
    for (const handler of this.handlers) await handler(event);
  }
  private settleConfiguration(error?: Error) {
    const pending = this.pendingConfiguration;
    if (!pending) return;
    this.pendingConfiguration = null;
    clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve();
  }
}

function decodePcm16(payload: Uint8Array) {
  if (payload.byteLength % 2)
    throw new RealtimeVoiceError(
      "unsupported_codec",
      400,
      "Realtime PCM payload is malformed",
    );
  const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    ),
    samples = new Int16Array(payload.byteLength / 2);
  for (let index = 0; index < samples.length; index++)
    samples[index] = view.getInt16(index * 2, true);
  return samples;
}

function encodePcm16(samples: Int16Array) {
  const payload = Buffer.allocUnsafe(samples.length * 2);
  for (let index = 0; index < samples.length; index++)
    payload.writeInt16LE(samples[index], index * 2);
  return payload;
}
