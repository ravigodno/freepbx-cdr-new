import { createRequire } from "module";
import crypto from "node:crypto";
import fetch from "node-fetch";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AudioFrame } from "../../media/mediaTypes.js";
import { AudioPacketizer } from "../../media/audioPacketizer.js";
import { AudioResampler } from "../../media/audioResampler.js";
import { decodeUlawToPcm16, encodePcm16ToUlaw } from "../../media/g711.js";
import type { RealtimeVoiceProviderAdapter } from "../realtimeVoiceProviderAdapter.js";
import type {
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
} from "../realtimeVoiceTypes.js";
import { RealtimeVoiceError } from "../realtimeVoiceErrors.js";
import { normalizeOpenAIRealtimeEvent } from "../realtimeVoiceEventNormalizer.js";
import { ProviderSilenceTracker } from "../providerSilenceMetrics.js";
import { synthesizeYandexSpeech, recognizeYandexSpeech, yandexPronunciationText } from "../yandexSpeechKitService.js";
import { YandexTurnAudio } from '../yandexTurnAudio.js';
import { Pcm16FrameStream } from '../yandexAudioStream.js';
import { YandexInputTranscript } from "../yandexInputTranscript.js";

const PROVIDER_SAMPLE_RATE = 24000;
const INTERNAL_SAMPLE_RATE = 16000;
const GENERAL_MAX_OUTPUT_TOKENS = 4096;
const MAX_PACKETIZER_CHUNK_MS = 200;
const PCM16_BYTES_PER_SAMPLE = 2;
const ULAW_FRAME_BYTES = 160;
const PLANNED_SPEECH_CACHE_DIR = process.env.PBXPULS_AI_SPEECH_CACHE_DIR || "/var/cache/pbxpuls/ai-runtime-speech";

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
  constructor(private readonly providerKey = "openai_realtime") {}
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
  private wireTrace: Array<Record<string, unknown>> = [];
  private readonly yandexInputTranscript=new YandexInputTranscript();
  private readonly yandexTurnAudio=new YandexTurnAudio();
  private yandexRecognitionAbort:AbortController|null=null;
  private traceWire(direction:string,value:any){
    if(this.providerKey!=="yandex_speechkit"||String(value?.type||"").endsWith(".delta")||value?.type==="input_audio_buffer.append")return;
    const entry={at:Date.now(),direction,type:value?.type,responseId:value?.response_id||value?.response?.id,itemId:value?.item_id||value?.item?.id,status:value?.response?.status,errorCode:value?.error?.code,errorParam:value?.error?.param};
    this.wireTrace.push(entry);if(this.wireTrace.length>160)this.wireTrace.shift();
  }
  private readonly providerSilence = new ProviderSilenceTracker();
  private eventChain: Promise<void> = Promise.resolve();
  private eventQueueTimings=new Map<string,{count:number;waitMaxMs:number;handlerMaxMs:number}>();
  private plannedSpeechTimings:Array<{firstAudioMs:number|null;totalMs:number;completed:boolean}>=[];
  private plannedSpeech = new Map<string, AbortController>();
  private pendingConfiguration: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  getKey() {
    return this.providerKey;
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
      tools: true,
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
    const allowed = this.providerKey === "yandex_speechkit"
      ? /^wss:\/\/ai\.api\.cloud\.yandex\.net\/v1\/realtime\/?(?:\?|$)/
      : /^wss:\/\/api\.openai\.com\//;
    if (!allowed.test(String(config.url)))
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
    this.yandexInputTranscript.reset();
    this.yandexTurnAudio.reset();
    this.eventChain = Promise.resolve();
    this.providerSilence.reset();
    this.health = { state: "connecting", failureCode: null, connectedAt: null };
    const url = new URL(config.url!);
    url.searchParams.set("model", String(config.model));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = new WebSocketClient(url, {
        headers: { Authorization: `${this.providerKey === "yandex_speechkit" ? "Api-Key" : "Bearer"} ${config.apiKey}` },
      });
      const transportStarted=Date.now(),transportStages:Record<string,number>={};
      socket._req?.on("socket",(transport:any)=>{
        transportStages.socket=Date.now()-transportStarted;
        for(const phase of ["lookup","connect","secureConnect"])
          transport.once(phase,()=>{transportStages[phase]=Date.now()-transportStarted;});
      });
      this.socket = socket;
      const timer = setTimeout(() => {
        console.warn("[AI_VOICE] realtime connection timeout",{provider:this.providerKey,elapsedMs:Date.now()-transportStarted,transportStages,requestPresent:!!socket._req,socketPresent:!!socket._req?.socket,readyState:socket.readyState,model:String(config.model||"").split("/").at(-1)});
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
          const inputSnapshot=this.providerKey==="yandex_speechkit"&&raw.type==="conversation.item.input_audio_transcription.completed"&&typeof raw.transcript==="string"?raw.transcript:undefined;
          if(this.providerKey==="yandex_speechkit"&&raw.type==="conversation.item.input_audio_transcription.completed"&&typeof raw.transcript==="string")
            raw.transcript=this.yandexInputTranscript.preview(raw.transcript);
          this.traceWire("received",raw);
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
                this.providerSilence.record(
                  responseId,
                  decodeUlawToPcm16(payload),
                );
                this.queueEvent({
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
                    source: this.providerKey,
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
                  source: this.providerKey,
                  traceId: "provider",
                  voiceSessionId: 0,
                  mediaSessionId: 0,
                },
              );
              for (const frame of frames) {
                this.providerSilence.record(
                  responseId,
                  decodePcm16(frame.payload),
                );
                this.queueEvent({
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
            source: this.providerKey,
            traceId: "provider",
            voiceSessionId: 0,
            mediaSessionId: 0,
          }));
          if (normalized?.type === "session_configured") {
            this.settleConfiguration();
          }
          if (normalized?.type === "error") {
            const wasConfiguring = Boolean(this.pendingConfiguration);
            const providerMessage = String(raw?.error?.message || "")
              .replace(/[\r\n\t]+/g, " ")
              .slice(0, 500);
            this.settleConfiguration(
              new RealtimeVoiceError(
                "provider_response_failed",
                502,
                `Realtime session configuration was rejected (${normalized.errorCode})${providerMessage ? `: ${providerMessage}` : ""}`,
              ),
            );
            if (wasConfiguring) return;
          }
          if(normalized?.type==="transcript"&&inputSnapshot!==undefined)normalized.inputSnapshot=inputSnapshot;
          if (normalized) this.queueEvent(normalized);
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
        ...(this.providerKey === "openai_realtime" && /^gpt-realtime-2(?:\.|$)/.test(String(config.model)) && config.reasoningEffort
          ? { reasoning: { effort: config.reasoningEffort } }
          : {}),
        ...(this.providerKey === "openai_realtime" && config.tools.length
          ? {
              tools: config.tools.map((tool) => ({
                type: "function",
                name: tool.key,
                description: tool.description,
                parameters: tool.inputSchema,
              })),
              tool_choice: "auto",
            }
          : {}),
        ...(this.providerKey === "yandex_speechkit" && config.hostedFileSearch
          ? {
              tools: [
                {
                  type: "function",
                  name: "file_search",
                  description: config.hostedFileSearch.vectorStoreIds[0],
                  parameters: {},
                },
              ],
            }
          : {}),
        max_output_tokens: config.unlimitedOutputTokens ? "inf" : config.maxOutputTokens || GENERAL_MAX_OUTPUT_TOKENS,
        output_modalities: ["audio"],
        audio: {
          input: {
            format:
              config.inputFormat.sampleRate === 8000 && this.providerKey !== "yandex_speechkit"
                ? { type: "audio/pcmu" }
                : { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            ...(this.providerKey === "openai_realtime" ? {
              ...(config.noiseReduction === "off"
                ? { noise_reduction: null }
                : { noise_reduction: { type: config.noiseReduction || "near_field" } }),
              transcription: {
                model: config.transcriptionModel || "gpt-live-transcribe",
                language: config.language.split("-")[0] || "ru",
              },
            } : {}),
            ...(this.providerKey === "yandex_speechkit" ? { languages: [config.language] } : {}),
            turn_detection: config.semanticVad
              ? {
                  type: "semantic_vad",
                  eagerness: config.responseEagerness || "medium",
                  create_response: false,
                  interrupt_response: false,
                }
              : config.serverVad
                ? {
                    type: "server_vad",
                    ...(this.providerKey === "yandex_speechkit" ? { threshold: config.vadThreshold ?? 0.9 } : {}),
                    silence_duration_ms: config.endOfTurnSilenceMs || 500,
                    create_response: false,
                    interrupt_response: false,
                  }
                : null,
          },
          output: {
            format:
              config.outputFormat.codec === "ulaw"
                ? { type: "audio/pcmu" }
                : { type: "audio/pcm", rate: PROVIDER_SAMPLE_RATE },
            voice: config.voice || "marin",
            ...(this.providerKey === "yandex_speechkit" && config.voiceRole ? { role: config.voiceRole } : {}),
            ...(this.providerKey === "yandex_speechkit" && config.speechRate ? { speed: config.speechRate } : {}),
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
        frame.sampleRate === 8000 && this.providerKey !== "yandex_speechkit"
          ? Buffer.from(encodePcm16ToUlaw(input))
          : encodePcm16(
              this.resampler.resamplePcm16(
                input,
                frame.sampleRate,
                PROVIDER_SAMPLE_RATE,
              ),
            );
    if(this.providerKey==='yandex_speechkit')
      this.yandexTurnAudio.append(encodePcm16(this.resampler.resamplePcm16(input,frame.sampleRate,16000)));
    this.send({
      type: "input_audio_buffer.append",
      audio: providerAudio.toString("base64"),
    });
  }
  async commitInput() {
    if(this.providerKey==='yandex_speechkit')this.yandexTurnAudio.commit();
    this.send({ type: "input_audio_buffer.commit" });
  }
  async requestInputTranscript() {
    if(this.providerKey!=="yandex_speechkit"||!this.config)return;
    // Internal recognition must not run the agent's sales/skill instructions.
    await this.configureSession({...this.config,
      instructions:"Служебная проверка распознавания: верни только одно слово «Готово».",
      maxOutputTokens:8,
    });
    this.send({type:"response.create"});
  }
  acceptInputTranscript(snapshot:string) {
    if(this.providerKey==="yandex_speechkit"){
      this.yandexInputTranscript.accept(snapshot);
      this.yandexTurnAudio.accept();
    }
  }
  cancelInputRecognition(){this.yandexRecognitionAbort?.abort();}
  resetInputRecognition(){this.cancelInputRecognition();this.yandexTurnAudio.reset();}
  async recognizeCommittedInput():Promise<Extract<RealtimeVoiceEvent,{type:'transcript'}>|null>{
    if(this.providerKey!=='yandex_speechkit'||!this.config)return null;
    const pcm=this.yandexTurnAudio.snapshot();
    if(!pcm)return null;
    const controller=new AbortController();this.yandexRecognitionAbort=controller;
    let deadline=false;
    const timer=setTimeout(()=>{deadline=true;controller.abort();},5000);
    try{
      const folderId=/^gpt:\/\/([^/]+)\//u.exec(String(this.config.model||''))?.[1]||'';
      const result=await recognizeYandexSpeech({providerKey:'yandex',model:'',secret:this.config.apiKey,options:{folderId,sttLanguage:this.config.language}},pcm,{signal:controller.signal});
      const event=normalizeOpenAIRealtimeEvent({type:'conversation.item.input_audio_transcription.completed',transcript:result.text,item_id:`speechkit-${crypto.randomUUID()}`},()=>{throw new Error('Unexpected recognition audio')});
      return event?.type==='transcript'?event:null;
    }catch(error){if(deadline)throw Object.assign(new Error('Current-turn recognition deadline'),{code:'recognition_deadline'});throw error;}
    finally{clearTimeout(timer);if(this.yandexRecognitionAbort===controller)this.yandexRecognitionAbort=null;}
  }
  async createResponse(contextInstructions?:string) {
    return this.sendResponse(
      this.config?.maxOutputTokens,
      [
        this.providerKey === "yandex_speechkit"
          ? this.config?.responseInstructions || "Отвечай только на русском языке, кратко и по существу."
          : "Отвечай только на русском языке. Дай одно законченное короткое предложение и сразу замолчи.",
        contextInstructions || "",
      ].filter(Boolean).join("\n"),
      undefined,
    );
  }
  async createFarewellResponse() {
    await this.createPlannedResponse(
      "Спасибо за звонок. До свидания!",
      "Произнеси короткое тёплое прощание",
    );
  }
  async createPlannedResponse(text:string,instructions:string) {
    const safeText=String(text||"").trim().slice(0,4000);
    if(["openai_realtime","yandex_speechkit"].includes(this.providerKey)&&safeText&&this.config?.apiKey){
      const responseId=`pbxpuls-tts-${crypto.randomUUID()}`,
        itemId=`pbxpuls-tts-item-${crypto.randomUUID()}`,
        aborter=new AbortController();
      this.plannedSpeech.set(responseId,aborter);
      this.queueEvent({type:"response_started",responseId});
      this.queueEvent({type:"response_item",status:"added",responseId,itemId,role:"assistant"});
      const rendering=this.providerKey==="yandex_speechkit"
        ? this.renderYandexPlannedSpeech(responseId,itemId,safeText,aborter)
        : this.renderPlannedSpeech(responseId,itemId,safeText,instructions,aborter);
      void rendering.catch((error:any)=>{
        console.warn("[AI_VOICE] planned speech rendering failed",{
          provider:this.providerKey,
          code:String(error?.code||error?.name||"unknown").slice(0,80),
          message:String(error?.message||"rendering_failed").replace(/[\r\n\t]+/g," ").slice(0,300),
        });
        if(!aborter.signal.aborted)this.queueEvent({type:"error",errorCode:"provider_response_failed"});
      });
      return;
    }
    return this.sendResponse(
      this.config?.maxOutputTokens,
      `${instructions}\nГовори как носитель русского языка: используй чистое нормативное русское произношение, естественную русскую интонацию и ударения. Произнеси дословно и полностью, без дополнений: «${safeText}»`,
      "none",
    );
  }
  private async renderYandexPlannedSpeech(responseId:string,itemId:string,text:string,aborter:AbortController){
    const started=performance.now(),timing={firstAudioMs:null as number|null,totalMs:0,completed:false};
    this.plannedSpeechTimings.push(timing);if(this.plannedSpeechTimings.length>20)this.plannedSpeechTimings.shift();
    try{
      const folderId=/^gpt:\/\/([^/]+)\//u.exec(String(this.config?.model||""))?.[1]||"";
      const frames=new Pcm16FrameStream(samples=>{
        if(aborter.signal.aborted)return;
        timing.firstAudioMs??=Math.round(performance.now()-started);
        const payload=Buffer.from(encodePcm16ToUlaw(samples));
        this.queueEvent({type:"output_audio",responseId,itemId,frame:{sequence:this.ulawOutputSequence++,timestampMs:Date.now(),direction:"egress",codec:"ulaw",sampleRate:8000,channels:1,durationMs:20,payload,source:this.providerKey,traceId:"provider",voiceSessionId:0,mediaSessionId:0,responseId,providerItemId:itemId,providerArrivedAtMs:Date.now(),providerEventSequence:this.providerEventSequence++,contentIndex:0}});
      });
      const synthesisText=this.config?.ownerControlTest?yandexPronunciationText(text,this.config.pronunciationEntries||[]):text;
      await synthesizeYandexSpeech({providerKey:"yandex",model:"",secret:this.config?.apiKey,options:{folderId}},synthesisText,this.config?.voice,{role:this.config?.voiceRole,speechRate:this.config?.speechRate,signal:aborter.signal,onPcmChunk:audio=>frames.push(audio)});
      if(aborter.signal.aborted)return;
      frames.finish();
      timing.completed=true;
      this.queueEvent({type:"transcript",kind:"output_final",text,responseId,itemId,contentIndex:0});
      this.queueEvent({type:"response_item",status:"done",responseId,itemId,role:"assistant"});
      this.queueEvent({type:"response_completed",responseId,providerStatus:"completed",finishReason:"completed",outputTranscript:text});
    }finally{timing.totalMs=Math.round(performance.now()-started);this.plannedSpeech.delete(responseId)}
  }
  private async renderPlannedSpeech(responseId:string,itemId:string,text:string,instructions:string,aborter:AbortController){
    try{
      const pronunciation=[
        ...(this.config?.pronunciationEntries||[]).map(item=>
          `«${item.source}» произноси как «${item.pronunciation}»${item.stress?`, ударение: ${item.stress}`:""}`,
        ),
        this.config?.pronunciationInstructions||"",
      ].filter(Boolean).join(". ");
      const cacheKey=crypto.createHash("sha256").update(JSON.stringify({model:"gpt-4o-mini-tts",voice:this.config?.voice||"marin",text,instructions,pronunciation})).digest("hex"),
        cacheFile=path.join(PLANNED_SPEECH_CACHE_DIR,`${cacheKey}.ulaw`),
        emitPayload=(payload:Buffer)=>this.queueEvent({type:"output_audio",responseId,itemId,frame:{sequence:this.ulawOutputSequence++,timestampMs:Date.now(),direction:"egress",codec:"ulaw",sampleRate:8000,channels:1,durationMs:20,payload,source:this.providerKey,traceId:"provider",voiceSessionId:0,mediaSessionId:0,responseId,providerItemId:itemId,providerArrivedAtMs:Date.now(),providerEventSequence:this.providerEventSequence++,contentIndex:0}}),
        finish=()=>{
          this.queueEvent({type:"transcript",kind:"output_final",text,responseId,itemId,contentIndex:0});
          this.queueEvent({type:"response_item",status:"done",responseId,itemId,role:"assistant"});
          this.queueEvent({type:"response_completed",responseId,providerStatus:"completed",finishReason:"completed",outputTranscript:text});
        };
      try{
        const cached=await readFile(cacheFile);
        if(cached.length&&cached.length%ULAW_FRAME_BYTES===0){
          for(let offset=0;offset<cached.length;offset+=ULAW_FRAME_BYTES)emitPayload(cached.subarray(offset,offset+ULAW_FRAME_BYTES));
          finish();return;
        }
      }catch{}
      const response=await fetch("https://api.openai.com/v1/audio/speech",{
        method:"POST",signal:aborter.signal,headers:{Authorization:`Bearer ${this.config?.apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:"gpt-4o-mini-tts",voice:this.config?.voice||"marin",input:text,response_format:"pcm",instructions:`${instructions}. Говори как носитель русского языка: чистое нормативное русское произношение, естественная русская интонация и ударения.${pronunciation?` Словарь произношения: ${pronunciation}.`:""}`}),
      });
      if(!response.ok)throw new RealtimeVoiceError("provider_response_failed",502,`Speech renderer returned HTTP ${response.status}`);
      const outputRate=this.config?.outputFormat.sampleRate||8000;
      if(outputRate!==8000||this.config?.outputFormat.codec!=="ulaw")
        throw new RealtimeVoiceError("unsupported_codec",400,"Streaming speech renderer requires 8 kHz u-law output");
      let byteRemainder=Buffer.alloc(0),inputSampleIndex=0;
      const outputSamples:number[]=[],cacheFrames:Buffer[]=[];
      const emitFrame=(values:number[])=>{
        const padded=new Int16Array(160);padded.set(values.slice(0,160));
        const payload=Buffer.from(encodePcm16ToUlaw(padded));
        cacheFrames.push(payload);emitPayload(payload);
      };
      for await(const rawChunk of response.body as any){
        if(aborter.signal.aborted)return;
        const chunk=Buffer.concat([byteRemainder,Buffer.from(rawChunk)]),usable=chunk.length-(chunk.length%2);
        byteRemainder=chunk.subarray(usable);
        for(let offset=0;offset<usable;offset+=2,inputSampleIndex++)
          if(inputSampleIndex%3===0)outputSamples.push(chunk.readInt16LE(offset));
        while(outputSamples.length>=160)emitFrame(outputSamples.splice(0,160));
      }
      if(outputSamples.length)emitFrame(outputSamples);
      if(cacheFrames.length&&!aborter.signal.aborted)void (async()=>{
        await mkdir(PLANNED_SPEECH_CACHE_DIR,{recursive:true});
        const temporary=`${cacheFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
        await writeFile(temporary,Buffer.concat(cacheFrames));await rename(temporary,cacheFile);
      })().catch(()=>{});
      finish();
    }finally{this.plannedSpeech.delete(responseId)}
  }
  async retryResponse(itemId: string | undefined, maxOutputTokens: number) {
    if (itemId)
      this.send({ type: "conversation.item.delete", item_id: itemId });
    return this.sendResponse(
      maxOutputTokens,
      this.config?.retryInstructions || "Предыдущий ответ не озвучивай. Ответь заново одной короткой фразой на русском языке.",
    );
  }
  async createFallbackResponse(itemId: string | undefined) {
    if (itemId)
      this.send({ type: "conversation.item.delete", item_id: itemId });
    return this.sendResponse(
      this.config?.greetingOutputTokens || 160,
      "Произнеси дословно и полностью: «Повторите, пожалуйста, вопрос.»",
    );
  }
  private async sendResponse(maxOutputTokens: number | undefined, instructions: string,toolChoice?:"none") {
    if(this.providerKey==="yandex_speechkit"&&this.config){
      // Verified against Yandex: per-response overrides are ignored. Apply the
      // instructions to the session before requesting generation instead.
      await this.configureSession({...this.config,
        instructions:[this.config.instructions,instructions].filter(Boolean).join("\n"),
        maxOutputTokens:maxOutputTokens||this.config.maxOutputTokens,
      });
      this.send({type:"response.create"});
      return;
    }
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        max_output_tokens: this.config?.unlimitedOutputTokens
          ? "inf"
          : maxOutputTokens || this.config?.maxOutputTokens || GENERAL_MAX_OUTPUT_TOKENS,
        instructions,
        ...(toolChoice?{tool_choice:toolChoice}:{}),
      },
    });
  }
  async createResponseForRemainder(itemId: string | undefined, text: string) {
    const remainder = text.trim().slice(0, 500);
    if (!remainder) return;
    if (itemId)
      this.send({ type: "conversation.item.delete", item_id: itemId });
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: remainder }],
      },
    });
    await this.createResponse();
  }
  async createRussianCorrection() {
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions:
          "Предыдущий ответ не озвучивай. Ответь заново как носитель русского языка: используй чистое нормативное русское произношение, естественную русскую интонацию и ударения.",
      },
    });
  }
  async startInitialGreeting(text: string) {
    if(this.providerKey==="openai_realtime"){
      await this.createPlannedResponse(text,"Произнеси короткое приветствие");
      return;
    }
    if(this.providerKey==="yandex_speechkit"){
      return this.sendResponse(this.config?.greetingOutputTokens||160,
        `Произнеси дословно и без дополнений: «${text}»`);
    }
    this.send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        max_output_tokens: this.config?.greetingOutputTokens || 160,
        instructions: `Говори как носитель русского языка: используй чистое нормативное русское произношение, естественную русскую интонацию и ударения. Произнеси дословно и без дополнений: «${text}»`,
      },
    });
  }
  async cancelResponse(responseId?: string) {
    if(responseId&&this.plannedSpeech.has(responseId)){
      this.plannedSpeech.get(responseId)?.abort();
      this.plannedSpeech.delete(responseId);
      this.queueEvent({type:"response_cancelled",responseId,providerStatus:"cancelled",finishReason:"cancelled"});
      return;
    }
    this.send({
      type: "response.cancel",
      // Yandex Realtime accepts cancellation of the current response, but its
      // protocol rejects the OpenAI-specific response_id field.
      ...(responseId && this.providerKey !== "yandex_speechkit" ? { response_id: responseId } : {}),
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
  async sendToolResult(callId: string, result: unknown) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this.send({ type: "response.create", response: { output_modalities: ["audio"] } });
  }
  async close() {
    this.yandexRecognitionAbort?.abort();
    this.yandexTurnAudio.reset();
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
      providerSilence: this.providerSilence.metrics(),
      wireTrace:this.wireTrace,
      eventQueueTimings:Object.fromEntries(this.eventQueueTimings),
      plannedSpeechTimings:this.plannedSpeechTimings,
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
    this.traceWire("sent",value);
    this.socket.send(JSON.stringify(value));
  }
  private async emit(event: RealtimeVoiceEvent) {
    for (const handler of this.handlers) await handler(event);
  }
  private queueEvent(event: RealtimeVoiceEvent) {
    const queued=performance.now();
    this.eventChain = this.eventChain
      .catch(() => {})
      .then(async()=>{
        const started=performance.now(),timing=this.eventQueueTimings.get(event.type)||{count:0,waitMaxMs:0,handlerMaxMs:0};
        timing.count++;timing.waitMaxMs=Math.max(timing.waitMaxMs,Math.round(started-queued));
        this.eventQueueTimings.set(event.type,timing);
        try{await this.emit(event);}finally{timing.handlerMaxMs=Math.max(timing.handlerMaxMs,Math.round(performance.now()-started));}
      });
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
