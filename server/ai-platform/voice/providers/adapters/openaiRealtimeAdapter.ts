import { createRequire } from "module";
import type { AudioFrame } from "../../media/mediaTypes.js";
import { AudioPacketizer } from "../../media/audioPacketizer.js";
import { AudioResampler } from "../../media/audioResampler.js";
import type { RealtimeVoiceProviderAdapter } from "../realtimeVoiceProviderAdapter.js";
import type {
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
} from "../realtimeVoiceTypes.js";
import { RealtimeVoiceError } from "../realtimeVoiceErrors.js";
import { normalizeOpenAIRealtimeEvent } from "../realtimeVoiceEventNormalizer.js";

const PROVIDER_SAMPLE_RATE = 24000;
const INTERNAL_SAMPLE_RATE = 16000;

export function readOpenAIRealtimeConfig() {
  const apiKey = process.env.OPENAI_API_KEY || "",
    url =
      process.env.PBXPULS_OPENAI_REALTIME_URL ||
      "wss://api.openai.com/v1/realtime",
    model = process.env.PBXPULS_OPENAI_REALTIME_MODEL || "gpt-realtime";
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
      supportedInputFormats: [pcm],
      supportedOutputFormats: [pcm],
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
            const frames = this.outputPacketizer.pushPcm(
              Buffer.from(raw.delta, "base64"),
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
              void this.emit({ type: "output_audio", frame });
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
          if (normalized) void this.emit(normalized);
        } catch {}
      });
      socket.on("close", () => {
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
    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        model: config.model,
        instructions: config.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            turn_detection: config.serverVad ? { type: "server_vad" } : null,
          },
          output: {
            format: { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            voice: config.voice || "marin",
          },
        },
      },
    });
  }
  async appendAudio(frame: AudioFrame) {
    if (frame.codec !== "slin16" || frame.channels !== 1)
      throw new RealtimeVoiceError(
        "unsupported_codec",
        400,
        "Realtime input format is unsupported",
      );
    const input = decodePcm16(frame.payload),
      providerPcm = this.resampler.resamplePcm16(
        input,
        frame.sampleRate,
        PROVIDER_SAMPLE_RATE,
      );
    this.send({
      type: "input_audio_buffer.append",
      audio: encodePcm16(providerPcm).toString("base64"),
    });
  }
  async commitInput() {
    this.send({ type: "input_audio_buffer.commit" });
    this.send({ type: "response.create" });
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
  async cancelResponse() {
    this.send({ type: "response.cancel" });
  }
  async sendToolResult() {
    throw new RealtimeVoiceError(
      "permission_denied",
      403,
      "External realtime tools are disabled",
    );
  }
  async close() {
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
