import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import { redactAiPlatformValue } from "../../core/redaction.js";
import { MediaSessionRepository } from "./mediaSessionRepository.js";
import { MediaTransportRegistry } from "./mediaTransportRegistry.js";
import { CodecRegistry } from "./codecRegistry.js";
import { MediaFrameNormalizer } from "./mediaFrameNormalizer.js";
import { JitterBuffer } from "./jitterBuffer.js";
import { BackpressureController } from "./backpressureController.js";
import { VadDetector } from "./vadDetector.js";
import { BargeInController } from "./bargeInController.js";
import { MediaMetrics } from "./mediaMetrics.js";
import { MediaError } from "./mediaErrors.js";
import type {
  AudioFormat,
  AudioFrame,
  MediaSessionProjection,
  MediaSessionState,
  SyntheticFixture,
} from "./mediaTypes.js";
import { SyntheticMediaAdapter } from "./transports/syntheticMediaAdapter.js";
import { AudioSocketAdapter } from "./transports/audioSocketAdapter.js";
import type { MediaTransportAdapter } from "./mediaTransportAdapter.js";
import { BoundedSerialProcessor } from "./boundedSerialProcessor.js";
import { MetricsFlusher } from "./metricsFlusher.js";
import { decodeUlawToPcm16 } from "./g711.js";
import { readVoiceDurationPolicy, type VoiceDurationPolicy } from "./voiceDurationPolicy.js";
import { AudioPreRollBuffer } from "./audioPreRollBuffer.js";

const transitions: Record<MediaSessionState, MediaSessionState[]> = {
  created: ["negotiating", "failed", "cancelled"],
  negotiating: ["ready", "failed", "cancelled"],
  ready: ["streaming", "failed", "cancelled"],
  streaming: ["paused", "draining", "failed", "cancelled"],
  paused: ["streaming", "draining", "failed", "cancelled"],
  draining: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
const EGRESS_PLAYOUT_CAPACITY_FRAMES = 3000;
const INGRESS_CAPTURE_CAPACITY_FRAMES = 3000;
type Runtime = {
  tenantId: number;
  adapter: MediaTransportAdapter;
  aborter: AbortController;
  jitter: JitterBuffer;
  ingress: BackpressureController<AudioFrame>;
  egress: BackpressureController<AudioFrame>;
  ingressProcessor: BoundedSerialProcessor<AudioFrame>;
  egressProcessor: BoundedSerialProcessor<AudioFrame>;
  flusher: MetricsFlusher;
  vad: VadDetector;
  barge: BargeInController;
  metrics: MediaMetrics;
  unsubscribe: () => void;
  ingressSubscribers: Set<(frame: AudioFrame) => void | Promise<void>>;
  vadSubscribers: Set<
    (event: VadSignalEvent) => void | Promise<void>
  >;
  lastOutputEnergy: number;
  lastOutputAt: number;
  started: number;
  events: number;
  vadState: string;
  overloadReported: boolean;
  flushFailureReported: boolean;
  stopping: boolean;
  greetingStatus: string | null;
  durationPolicy: VoiceDurationPolicy;
  durationWarningSent: boolean;
  durationEnding: boolean;
  syntheticSafetyLimit: boolean;
  preRoll: AudioPreRollBuffer;
  preRollFramesCaptured: number;
  preRollFramesCommitted: number;
  preRollFramesDropped: number;
  preRollDurationMsCommitted: number;
};
export type VadSignalEvent = {
  type: "speech_started" | "speech_ended";
  energyLevel: number;
  confidence: number;
  echoSuspected: boolean;
  outputEnergyLevel: number;
};
const rms = (samples: Int16Array) => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / Math.max(1, samples.length));
};

export class MediaSessionService {
  private readonly repo: MediaSessionRepository;
  private readonly runtimes = new Map<number, Runtime>();
  private readonly normalizer = new MediaFrameNormalizer();
  private readonly codecs = new CodecRegistry();
  private providerCloser:
    | ((
        tenantId: number,
        mediaSessionId: number,
        traceId: string,
      ) => Promise<unknown>)
    | null = null;
  private durationCloser:
    | ((tenantId: number, mediaSessionId: number, traceId: string) => Promise<unknown>)
    | null = null;
  constructor(
    private readonly store: AiPlatformStore,
    private readonly audit: AiAuditService,
    private readonly registry: MediaTransportRegistry,
    private readonly isEnabled: () => Promise<boolean>,
  ) {
    this.repo = new MediaSessionRepository(store);
  }
  configureVad(tenantId:number,id:number,endSilenceMs:number){
    const runtime=this.runtimes.get(id);
    if(!runtime||runtime.tenantId!==tenantId)return false;
    const silence=Math.max(300,Math.min(600,Math.round(endSilenceMs)));
    runtime.vad=new VadDetector(700,2,silence);
    return true;
  }
  private runtime(
    tenantId: number,
    id: number,
    traceId: string,
    adapter: MediaTransportAdapter,
    aborter: AbortController,
    durationPolicy: VoiceDurationPolicy = {
      maxCallDurationSeconds: 60,
      warningThresholdSeconds: 10,
    },
    syntheticSafetyLimit = false,
  ) {
    let runtime: Runtime;
    const reportError = (code: string) => (error: unknown) => {
      if (runtime.stopping) return;
      void this.fail(tenantId, id, traceId, code).catch(() => {});
      void error;
    };
    runtime = {
      tenantId,
      adapter,
      aborter,
      jitter: new JitterBuffer(),
      ingress: new BackpressureController(20, 16, 6),
      egress: new BackpressureController(50, 40, 15),
      ingressProcessor: null as any,
      egressProcessor: null as any,
      flusher: null as any,
      vad: new VadDetector(),
      barge: new BargeInController(),
      metrics: new MediaMetrics(),
      unsubscribe: () => {},
      ingressSubscribers: new Set(),
      vadSubscribers: new Set(),
      lastOutputEnergy: 0,
      lastOutputAt: 0,
      started: Date.now(),
      events: 0,
      vadState: "silence",
      overloadReported: false,
      flushFailureReported: false,
      stopping: false,
      greetingStatus: null,
      durationPolicy,
      durationWarningSent: false,
      durationEnding: false,
      syntheticSafetyLimit,
      preRoll: new AudioPreRollBuffer(240),
      preRollFramesCaptured: 0,
      preRollFramesCommitted: 0,
      preRollFramesDropped: 0,
      preRollDurationMsCommitted: 0,
    };
    runtime.ingressProcessor = new BoundedSerialProcessor(
      (frame) => this.processIngress(tenantId, id, frame, traceId),
      {
        capacity: INGRESS_CAPTURE_CAPACITY_FRAMES,
        batchSize: 8,
        signal: aborter.signal,
        onDrop: () => runtime.metrics.droppedFrames++,
        onError: reportError("media_ingress_failed"),
      },
    );
    runtime.egressProcessor = new BoundedSerialProcessor(
      (frame) =>
        adapter instanceof AudioSocketAdapter
          ? adapter.sendFrame(frame)
          : Promise.resolve(),
      {
        capacity: EGRESS_PLAYOUT_CAPACITY_FRAMES,
        batchSize: 8,
        signal: aborter.signal,
        onDrop: () => runtime.metrics.droppedFrames++,
        onError: reportError("media_egress_failed"),
      },
    );
    runtime.flusher = new MetricsFlusher(
      () => this.persist(tenantId, id, runtime),
      1000,
      () => {
        if (!runtime.flushFailureReported) {
          runtime.flushFailureReported = true;
          void this.audit
            .append({
              tenantId,
              traceId,
              actorType: "service",
              eventType: "media_metrics_flush_failed" as any,
              entityType: "voice_media_session",
              entityId: String(id),
              decision: "degraded",
              details: {},
            })
            .catch(() => {});
        }
      },
    );
    runtime.ingressProcessor.start();
    runtime.egressProcessor.start();
    return runtime;
  }
  private projection(row: any, runtime?: Runtime): MediaSessionProjection {
    const metadata = JSON.parse(row.metadata_json || "{}");
    const protocol =
        runtime?.adapter.getProtocolMetrics?.() ||
        metadata.audioSocketProtocol ||
        null,
      capabilities = runtime?.adapter.getCapabilities().audioSocketProtocol;
    const iq = runtime?.ingressProcessor.getMetrics(),
      eq = runtime?.egressProcessor.getMetrics();
    return {
      id: Number(row.id),
      tenantId: Number(row.tenant_id),
      voiceSessionId: Number(row.voice_session_id),
      transportMode: row.transport_mode,
      state: row.state,
      codecIn: row.codec_in,
      codecOut: row.codec_out,
      sampleRateIn: Number(row.sample_rate_in),
      sampleRateOut: Number(row.sample_rate_out),
      channelsIn: Number(row.channels_in),
      channelsOut: Number(row.channels_out),
      frameDurationMs: Number(row.frame_duration_ms),
      ingressFrames: Number(row.ingress_frames),
      egressFrames: Number(row.egress_frames),
      ingressBytes: Number(row.ingress_bytes),
      egressBytes: Number(row.egress_bytes),
      droppedFrames: Number(row.dropped_frames),
      reorderedFrames: Number(row.reordered_frames),
      duplicateFrames: Number(row.duplicate_frames),
      jitterMsAvg:
        row.jitter_ms_avg === null ? null : Number(row.jitter_ms_avg),
      jitterMsP95:
        row.jitter_ms_p95 === null ? null : Number(row.jitter_ms_p95),
      ingressLatencyMsAvg:
        row.ingress_latency_ms_avg === null
          ? null
          : Number(row.ingress_latency_ms_avg),
      egressLatencyMsAvg:
        row.egress_latency_ms_avg === null
          ? null
          : Number(row.egress_latency_ms_avg),
      firstAudioAt: row.first_audio_at || null,
      lastAudioAt: row.last_audio_at || null,
      startedAt: row.started_at,
      endedAt: row.ended_at || null,
      failureCode: row.failure_code || null,
      vadState: runtime?.vadState || metadata.vadState || "silence",
      bargeInCount: runtime?.barge.count || Number(metadata.bargeInCount || 0),
      queueDepth: (iq?.depth || 0) + (eq?.depth || 0),
      memoryEstimateBytes: ((iq?.depth || 0) + (eq?.depth || 0)) * 640,
      audioSocketProtocol: protocol,
      transportFormat:
        capabilities?.transportFormat || metadata.transportFormat || null,
      sourceSampleRate: protocol?.ingressSourceSampleRate || null,
      internalSampleRate: capabilities?.internalSampleRate || 16000,
      targetSampleRate:
        protocol?.egressTargetSampleRate ||
        capabilities?.preferredAsteriskSampleRate ||
        null,
      resampling: Boolean(capabilities?.resamplingRequired),
      greetingStatus:
        runtime?.greetingStatus || metadata.greetingStatus || null,
    };
  }
  private async row(tenantId: number, id: number) {
    const rows = await this.repo.get(tenantId, id);
    if (!rows[0])
      throw new MediaError("not_found", 404, "Media session not found");
    return rows[0];
  }
  async get(tenantId: number, id: number) {
    return this.projection(await this.row(tenantId, id), this.runtimes.get(id));
  }
  async list(tenantId: number, limit: number, offset: number) {
    return (await this.repo.list(tenantId, limit, offset)).map((row) =>
      this.projection(row, this.runtimes.get(Number(row.id))),
    );
  }
  private async transition(
    tenantId: number,
    id: number,
    to: MediaSessionState,
    traceId: string,
    failureCode: string | null = null,
  ) {
    const row = await this.row(tenantId, id);
    if (row.state === to) return;
    if (!transitions[row.state as MediaSessionState]?.includes(to))
      throw new MediaError("conflict", 409, "Invalid media session transition");
    const result: any = await this.repo.transition(
      tenantId,
      id,
      row.state,
      to,
      failureCode,
    );
    if (!result.affectedRows)
      throw new MediaError(
        "conflict",
        409,
        "Concurrent media session transition",
      );
    const eventType =
      to === "ready"
        ? "media_session_ready"
        : to === "streaming"
          ? "media_stream_started"
          : to === "completed"
            ? "media_session_completed"
            : to === "failed"
              ? "media_session_failed"
              : to === "paused"
                ? "media_stream_paused"
                : "media_stream_resumed";
    await this.audit.append({
      tenantId,
      traceId,
      actorType: "service",
      eventType,
      entityType: "voice_media_session",
      entityId: String(id),
      decision: to,
      details: { failureCode },
    });
  }
  async createSynthetic(input: {
    tenantId: number;
    voiceSessionId: number;
    traceId: string;
    format?: AudioFormat;
  }) {
    if (!(await this.isEnabled()))
      throw new MediaError(
        "feature_disabled",
        503,
        "Voice media transport is disabled",
      );
    if (this.runtimes.size >= 2)
      throw new MediaError(
        "concurrency_limited",
        429,
        "Synthetic media session limit reached",
      );
    const voice = (
      await this.store.query(
        "SELECT id,state FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1",
        [input.tenantId, input.voiceSessionId],
      )
    )[0];
    if (!voice)
      throw new MediaError("not_found", 404, "Voice session not found");
    if (!["active", "waiting_for_media"].includes(voice.state))
      throw new MediaError("conflict", 409, "Voice session is not active");
    if ((await this.repo.findActive(input.tenantId, input.voiceSessionId))[0])
      throw new MediaError(
        "conflict",
        409,
        "Active media session already exists",
      );
    const format = input.format || this.codecs.preferredInternalFormat;
    this.codecs.negotiate(format, format);
    this.registry.get("synthetic");
    const id = await this.repo.create(
      input.tenantId,
      input.voiceSessionId,
      "synthetic",
      format,
    );
    await this.audit.append({
      tenantId: input.tenantId,
      traceId: input.traceId,
      actorType: "user",
      eventType: "media_session_created",
      entityType: "voice_media_session",
      entityId: String(id),
      decision: "created",
      details: {
        transportMode: "synthetic",
        codec: format.codec,
        sampleRate: format.sampleRate,
      },
    });
    await this.transition(input.tenantId, id, "negotiating", input.traceId);
    await this.audit.append({
      tenantId: input.tenantId,
      traceId: input.traceId,
      actorType: "service",
      eventType: "media_negotiation_started",
      entityType: "voice_media_session",
      entityId: String(id),
      decision: "started",
      details: {},
    });
    const adapter = new SyntheticMediaAdapter(),
      aborter = new AbortController();
    const runtime = this.runtime(
      input.tenantId,
      id,
      input.traceId,
      adapter,
      aborter,
      { maxCallDurationSeconds: 60, warningThresholdSeconds: 10 },
      true,
    );
    await adapter.createTransport({
      tenantId: input.tenantId,
      traceId: input.traceId,
      voiceSessionId: input.voiceSessionId,
      mediaSessionId: id,
      format,
      signal: aborter.signal,
    });
    this.runtimes.set(id, runtime);
    runtime.unsubscribe = adapter.subscribeFrames((frame) =>
      this.enqueueIngress(runtime, id, input.traceId, frame),
    );
    await adapter.start();
    await this.transition(input.tenantId, id, "ready", input.traceId);
    await this.transition(input.tenantId, id, "streaming", input.traceId);
    await this.store.query(
      "UPDATE ai_voice_sessions SET media_state='connected' WHERE tenant_id=? AND id=?",
      [input.tenantId, input.voiceSessionId],
    );
    return this.get(input.tenantId, id);
  }
  async prepareLiveAudioSocket(input: {
    tenantId: number;
    voiceSessionId: number;
    traceId: string;
  }) {
    if (!(await this.isEnabled()))
      throw new MediaError(
        "feature_disabled",
        503,
        "Voice media transport is disabled",
      );
    const flags = await this.store.query(
        "SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.platform_core_enabled','ai.voice_control_plane_enabled','ai.voice_media_transport_enabled','ai.realtime_voice_enabled','ai.voice_live_test_enabled','ai.voice_live_transport')",
      ),
      settings = new Map(
        flags.map((row: any) => [row.setting_key, row.setting_value]),
      );
    if (
      [
        "ai.platform_core_enabled",
        "ai.voice_control_plane_enabled",
        "ai.voice_media_transport_enabled",
        "ai.realtime_voice_enabled",
        "ai.voice_live_test_enabled",
      ].some((key) => settings.get(key) !== "true") ||
      settings.get("ai.voice_live_transport") !== "audiosocket"
    )
      throw new MediaError(
        "feature_disabled",
        503,
        "Controlled live media flags are disabled",
      );
    if (this.runtimes.size >= 2)
      throw new MediaError(
        "concurrency_limited",
        429,
        "Media session limit reached",
      );
    const voice = (
      await this.store.query(
        "SELECT id,state FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1",
        [input.tenantId, input.voiceSessionId],
      )
    )[0];
    if (!voice || voice.state !== "active")
      throw new MediaError("conflict", 409, "Voice session is not active");
    if ((await this.repo.findActive(input.tenantId, input.voiceSessionId))[0])
      throw new MediaError(
        "conflict",
        409,
        "Active media session already exists",
      );
    const durationPolicy = await readVoiceDurationPolicy(this.store),
      format = this.codecs.preferredInternalFormat,
      id = await this.repo.create(
        input.tenantId,
        input.voiceSessionId,
        "audiosocket",
        format,
      ),
      adapter = new AudioSocketAdapter(),
      aborter = new AbortController(),
      runtime = this.runtime(
        input.tenantId,
        id,
        input.traceId,
        adapter,
        aborter,
        durationPolicy,
      );
    await this.store.query(
      "UPDATE ai_voice_media_sessions SET max_call_duration_seconds=?,warning_threshold_seconds=? WHERE tenant_id=? AND id=?",
      [durationPolicy.maxCallDurationSeconds,durationPolicy.warningThresholdSeconds,input.tenantId,id],
    );
    await this.transition(input.tenantId, id, "negotiating", input.traceId);
    await adapter.createTransport({
      tenantId: input.tenantId,
      traceId: input.traceId,
      voiceSessionId: input.voiceSessionId,
      mediaSessionId: id,
      format,
      signal: aborter.signal,
    });
    this.runtimes.set(id, runtime);
    runtime.unsubscribe = adapter.subscribeFrames((frame) =>
      this.enqueueIngress(runtime, id, input.traceId, frame),
    );
    return { id, endpoint: adapter.getEndpoint() };
  }
  async startPreparedLive(tenantId: number, id: number, traceId: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError(
        "not_found",
        404,
        "Prepared media session not found",
      );
    await runtime.adapter.start();
    await this.transition(tenantId, id, "ready", traceId);
    await this.transition(tenantId, id, "streaming", traceId);
    const row = await this.row(tenantId, id);
    await this.store.query(
      "UPDATE ai_voice_sessions SET media_state='connected' WHERE tenant_id=? AND id=?",
      [tenantId, row.voice_session_id],
    );
    return this.get(tenantId, id);
  }
  private enqueueIngress(
    runtime: Runtime,
    id: number,
    traceId: string,
    frame: AudioFrame,
  ) {
    const result = runtime.ingressProcessor.enqueue(frame);
    runtime.flusher.markDirty();
    if (result.dropped && !runtime.overloadReported) {
      runtime.overloadReported = true;
      void this.audit
        .append({
          tenantId: runtime.tenantId,
          traceId,
          actorType: "service",
          eventType: "media_overloaded",
          entityType: "voice_media_session",
          entityId: String(id),
          decision: "dropping",
          details: { queue: "ingress" },
        })
        .catch(() => {});
    }
  }
  private async processIngress(
    tenantId: number,
    id: number,
    frame: AudioFrame,
    traceId: string,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.stopping) return;
    const elapsedMs = Date.now() - runtime.started,
      warningAtMs = Math.max(
        0,
        (runtime.durationPolicy.maxCallDurationSeconds -
          runtime.durationPolicy.warningThresholdSeconds) *
          1000,
      );
    if (!runtime.durationWarningSent && elapsedMs >= warningAtMs) {
      runtime.durationWarningSent = true;
      void this.audit.append({
        tenantId,traceId,actorType:"service",eventType:"voice_duration_warning" as any,
        entityType:"voice_media_session",entityId:String(id),decision:"warning",
        details:{remainingSeconds:runtime.durationPolicy.warningThresholdSeconds},
      }).catch(()=>{});
    }
    if (
      elapsedMs >= runtime.durationPolicy.maxCallDurationSeconds * 1000 ||
      (runtime.syntheticSafetyLimit && runtime.events >= 3000)
    ) {
      if (!runtime.durationEnding) {
        runtime.durationEnding = true;
        await this.store.query(
          "UPDATE ai_voice_media_sessions SET completion_reason='duration_limit' WHERE tenant_id=? AND id=?",
          [tenantId,id],
        );
        void (this.durationCloser
          ? this.durationCloser(tenantId,id,traceId)
          : this.stop(tenantId,id,traceId,"completed")).catch(()=>{});
      }
      return;
    }
    runtime.events++;
    if (Date.now() - frame.timestampMs > 5_000) {
      await this.fail(tenantId, id, traceId, "event_loop_lag");
      return;
    }
    const normalized = this.normalizer.toInternal(frame);
    const ready = runtime.jitter.push(normalized);
    for (const item of ready) {
      runtime.preRollFramesDropped+=runtime.preRoll.push(item);
      runtime.preRollFramesCaptured++;
      runtime.metrics.record(
        item.payload.byteLength,
        "ingress",
        item.timestampMs,
      );
      for (const subscriber of runtime.ingressSubscribers)
        await subscriber(item);
      const pcm = new Int16Array(
          item.payload.buffer,
          item.payload.byteOffset,
          item.payload.byteLength / 2,
        ),
        event = runtime.vad.process(pcm, item.durationMs),
        previous = runtime.vadState;
      runtime.vadState = runtime.vad.state();
      if (event.type === "speech_started") {
        const preRollFrames=runtime.preRoll.snapshot();
        runtime.preRollFramesCommitted+=preRollFrames.length;
        runtime.preRollDurationMsCommitted+=preRollFrames.reduce((sum,frame)=>sum+frame.durationMs,0);
        const outputRecent=Date.now()-runtime.lastOutputAt<=120,
          energyRatio=runtime.lastOutputEnergy>0
            ?event.energyLevel/runtime.lastOutputEnergy
            :Number.POSITIVE_INFINITY,
          signal:VadSignalEvent={
            type:"speech_started",
            energyLevel:event.energyLevel,
            confidence:event.confidence,
            echoSuspected:outputRecent&&energyRatio>=0.65&&energyRatio<=1.35,
            outputEnergyLevel:runtime.lastOutputEnergy,
          };
        for (const subscriber of runtime.vadSubscribers)
          await subscriber(signal);
        runtime.metrics.vadTransitions++;
        await this.audit.append({
          tenantId,
          traceId,
          actorType: "service",
          eventType: "vad_speech_started",
          entityType: "voice_media_session",
          entityId: String(id),
          decision: "detected",
          details: {
            confidence: event.confidence,
            energyLevel: Math.round(event.energyLevel),
          },
        });
      } else if (event.type === "speech_ended" && previous === "speech") {
        const signal:VadSignalEvent={
          type:"speech_ended",
          energyLevel:event.energyLevel,
          confidence:event.confidence,
          echoSuspected:false,
          outputEnergyLevel:runtime.lastOutputEnergy,
        };
        for (const subscriber of runtime.vadSubscribers)
          await subscriber(signal);
        runtime.metrics.vadTransitions++;
        await this.audit.append({
          tenantId,
          traceId,
          actorType: "service",
          eventType: "vad_speech_ended",
          entityType: "voice_media_session",
          entityId: String(id),
          decision: "detected",
          details: {},
        });
      }
    }
    runtime.flusher.markDirty();
  }
  async fixture(
    tenantId: number,
    id: number,
    type: SyntheticFixture,
    count: number,
    traceId: string,
  ) {
    const runtime = this.runtimes.get(id);
    if (
      !runtime ||
      runtime.tenantId !== tenantId ||
      !(runtime.adapter instanceof SyntheticMediaAdapter)
    )
      throw new MediaError(
        "not_found",
        404,
        "Active synthetic media session not found",
      );
    await runtime.adapter.fixture(type, count);
    await runtime.ingressProcessor.drain();
    return this.get(tenantId, id);
  }
  async injectRealtimeFixture(
    tenantId: number,
    id: number,
    fixture:
      | "silence"
      | "speech"
      | "question"
      | "transfer_request"
      | "callback_request"
      | "tool_query",
    traceId: string,
  ) {
    const runtime = this.runtimes.get(id);
    if (
      !runtime ||
      runtime.tenantId !== tenantId ||
      !(runtime.adapter instanceof SyntheticMediaAdapter)
    )
      throw new MediaError(
        "not_found",
        404,
        "Active synthetic media session not found",
      );
    const samples = 320,
      pcm = new Int16Array(samples),
      voiceSessionId = Number((await this.row(tenantId, id)).voice_session_id),
      baseSequence = runtime.events + 1;
    if (fixture !== "silence")
      for (let i = 0; i < samples; i++)
        pcm[i] = Math.round(4000 * Math.sin((2 * Math.PI * 220 * i) / 16000));
    for (let offset = 0; offset < 4; offset++) {
      const frame: AudioFrame = {
        sequence: baseSequence + offset,
        timestampMs: Date.now() + offset * 20,
        direction: "ingress",
        codec: "slin16",
        sampleRate: 16000,
        channels: 1,
        durationMs: 20,
        payload: new Uint8Array(pcm.buffer.slice(0)),
        source: fixture,
        traceId,
        voiceSessionId,
        mediaSessionId: id,
      };
      await this.processIngress(tenantId, id, frame, traceId);
    }
    return this.get(tenantId, id);
  }
  subscribeIngress(
    tenantId: number,
    id: number,
    handler: (frame: AudioFrame) => void | Promise<void>,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Active media session not found");
    runtime.ingressSubscribers.add(handler);
    return () => runtime.ingressSubscribers.delete(handler);
  }
  subscribeVad(
    tenantId: number,
    id: number,
    handler: (event: VadSignalEvent) => void | Promise<void>,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Active media session not found");
    runtime.vadSubscribers.add(handler);
    return () => runtime.vadSubscribers.delete(handler);
  }
  subscribePlayout(
    tenantId: number,
    id: number,
    handler: (frame: AudioFrame) => void,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Active media session not found");
    return runtime.adapter instanceof AudioSocketAdapter
      ? runtime.adapter.subscribePlayout((frame)=>{
          if(!runtime.barge.isPlaybackActive())runtime.barge.onPlaybackStarted();
          handler(frame);
        })
      : () => {};
  }
  subscribePlayoutLifecycle(
    tenantId: number,
    id: number,
    handler: (event: {
      type: "started" | "completed" | "interrupted";
      responseId?: string;
      playedAudioMs: number;
      discardedAudioMs?: number;
    }) => void,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Active media session not found");
    return runtime.adapter instanceof AudioSocketAdapter
      ? runtime.adapter.subscribePlayoutLifecycle(handler)
      : () => {};
  }
  async providerResponseDone(tenantId:number,id:number,responseId:string){
    const runtime=this.runtimes.get(id);
    if(runtime?.tenantId===tenantId&&runtime.adapter instanceof AudioSocketAdapter)
      await runtime.adapter.providerResponseDone(responseId);
  }
  getProtocolMetrics(tenantId: number, id: number) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId) return null;
    return runtime.adapter.getProtocolMetrics?.() || null;
  }
  async enqueueEgress(tenantId: number, id: number, frame: AudioFrame) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Active media session not found");
    const ownedFrame = {
      ...frame,
      direction: "egress",
      mediaSessionId: id,
    } as AudioFrame;
    const outputSamples=frame.codec==="ulaw"
      ?decodeUlawToPcm16(frame.payload)
      :frame.codec==="slin16"&&frame.payload.byteLength%2===0
        ?new Int16Array(frame.payload.buffer,frame.payload.byteOffset,frame.payload.byteLength/2)
        :null;
    if(outputSamples){
      runtime.lastOutputEnergy=rms(outputSamples);
      runtime.lastOutputAt=Date.now();
    }
    const directResult =
      runtime.adapter instanceof AudioSocketAdapter
        ? await runtime.adapter.sendFrame(ownedFrame)
        : null;
    const result =
      directResult ||
      runtime.egressProcessor.enqueue(ownedFrame);
    runtime.metrics.record(
      frame.payload.byteLength,
      "egress",
      frame.timestampMs,
    );
    if (result.dropped && !runtime.overloadReported) {
      runtime.overloadReported = true;
      void this.audit
        .append({
          tenantId,
          traceId: frame.traceId,
          actorType: "service",
          eventType: "media_overloaded",
          entityType: "voice_media_session",
          entityId: String(id),
          decision: "dropping",
          details: { queue: "egress" },
        })
        .catch(() => {});
    }
    runtime.flusher.markDirty();
    return {
      accepted: result.accepted,
      dropped: "dropped" in result ? result.dropped : false,
      depth: "depth" in result ? result.depth : 0,
      reason: "reason" in result ? result.reason : null,
    };
  }
  async clearEgress(
    tenantId: number,
    id: number,
    responseId?: string,
    reason: "barge_in" | "session_end" = "barge_in",
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId) return 0;
    runtime.egressProcessor.clear();
    const discardedMs =
      runtime.adapter instanceof AudioSocketAdapter
        ? await runtime.adapter.clearPlayoutAsync(responseId, reason)
        : 0;
    runtime.barge.onPlaybackStopped();
    runtime.flusher.markDirty();
    return discardedMs;
  }
  recordCanonicalBargeIn(tenantId:number,id:number){
    const runtime=this.runtimes.get(id);
    if(!runtime||runtime.tenantId!==tenantId)return false;
    runtime.barge.count++;
    runtime.barge.interruptions++;
    runtime.metrics.bargeInCount++;
    runtime.metrics.playbackInterruptions++;
    runtime.flusher.markDirty();
    return true;
  }
  async setGreetingStatus(
    tenantId: number,
    id: number,
    status: "started" | "completed" | "interrupted",
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId) return false;
    runtime.greetingStatus = status;
    runtime.flusher.markDirty();
    return true;
  }
  async bargeIn(tenantId: number, id: number, traceId: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new MediaError(
        "not_found",
        404,
        "Active synthetic media session not found",
      );
    const row = await this.row(tenantId, id),
      payload = new Uint8Array(
        (Number(row.sample_rate_out) * Number(row.frame_duration_ms)) / 500,
      );
    runtime.egressProcessor.enqueue({
      sequence: runtime.metrics.egressFrames,
      timestampMs: Date.now(),
      direction: "egress",
      codec: "slin16",
      sampleRate: 16000,
      channels: 1,
      durationMs: 20,
      payload,
      source: "synthetic_playback",
      traceId,
      voiceSessionId: Number(row.voice_session_id),
      mediaSessionId: id,
    });
    runtime.metrics.record(payload.byteLength, "egress", Date.now());
    runtime.barge.onPlaybackStarted();
    if (runtime.barge.onSpeechStarted()) {
      runtime.metrics.bargeInCount++;
      runtime.metrics.playbackInterruptions++;
      runtime.egressProcessor.clear();
      await this.audit.append({
        tenantId,
        traceId,
        actorType: "service",
        eventType: "barge_in_detected",
        entityType: "voice_media_session",
        entityId: String(id),
        decision: "interrupt",
        details: { synthetic: true },
      });
      await this.audit.append({
        tenantId,
        traceId,
        actorType: "service",
        eventType: "playback_cancel_requested",
        entityType: "voice_media_session",
        entityId: String(id),
        decision: "cancelled",
        details: { synthetic: true },
      });
    }
    await runtime.adapter.fixture("speech", 4);
    await this.persist(tenantId, id, runtime);
    return this.get(tenantId, id);
  }
  private async persist(tenantId: number, id: number, runtime: Runtime) {
    const jitter = runtime.jitter.metrics(),
      protocol = runtime.adapter.getProtocolMetrics?.() || null,
      capabilities = runtime.adapter.getCapabilities().audioSocketProtocol;
    const ingressQueue = runtime.ingressProcessor.getMetrics(),
      egressQueue = runtime.egressProcessor.getMetrics(),
      flush = runtime.flusher.getMetrics();
    runtime.metrics.droppedFrames =
      ingressQueue.dropped + egressQueue.dropped + jitter.dropped;
    runtime.metrics.reorderedFrames = jitter.reordered;
    runtime.metrics.duplicateFrames = jitter.duplicates;
    await this.repo.metrics(tenantId, id, {
      ...runtime.metrics,
      jitterAvg: jitter.jitterAvg,
      jitterP95: jitter.jitterP95,
      ingressLatency: runtime.metrics.averageLatency(),
      egressLatency: null,
      firstAudioAt: runtime.metrics.firstFrameAt
        ? new Date(runtime.metrics.firstFrameAt)
        : null,
      lastAudioAt: runtime.metrics.lastFrameAt
        ? new Date(runtime.metrics.lastFrameAt)
        : null,
      metadata: redactAiPlatformValue({
        vadState: runtime.vadState,
        bargeInCount: runtime.barge.count,
        playbackInterruptions: runtime.barge.interruptions,
        audioSocketProtocol: protocol,
        transportFormat: capabilities?.transportFormat || null,
        greetingStatus: runtime.greetingStatus,
        ingressQueueDepth: ingressQueue.depth,
        ingressQueuePeak: ingressQueue.peak,
        ingressQueueDropped: ingressQueue.dropped,
        jitterDropped: jitter.dropped,
        ingressConsumerLagMs: ingressQueue.consumerLagMs,
        ingressProcessingTimeAvg: ingressQueue.processingTimeAvgMs,
        ingressProcessingTimeP95: ingressQueue.processingTimeP95Ms,
        egressQueueDepth: egressQueue.depth,
        egressQueuePeak: egressQueue.peak,
        egressQueueDropped: egressQueue.dropped,
        egressSocketBackpressureCount:
          protocol?.egressSocketBackpressureCount || 0,
        metricsFlushCount: flush.metricsFlushCount,
        metricsFlushFailures: flush.metricsFlushFailures,
        metricsLastFlushedAt: flush.metricsLastFlushedAt,
        vadPreRollMs: runtime.preRoll.durationMs(),
        preRollFramesCaptured: runtime.preRollFramesCaptured,
        preRollFramesCommitted: runtime.preRollFramesCommitted,
        preRollFramesDropped: runtime.preRollFramesDropped,
        preRollDurationMsCommitted: runtime.preRollDurationMsCommitted,
      }).value,
    });
  }
  async stop(
    tenantId: number,
    id: number,
    traceId: string,
    terminal: "completed" | "cancelled" = "completed",
  ) {
    if (this.providerCloser)
      await this.providerCloser(tenantId, id, traceId).catch(() => {});
    const runtime = this.runtimes.get(id);
    if (runtime && runtime.tenantId !== tenantId)
      throw new MediaError("not_found", 404, "Media session not found");
    if (runtime) {
      if (runtime.stopping) return this.get(tenantId, id);
      runtime.stopping = true;
      runtime.unsubscribe();
      runtime.aborter.abort();
      await runtime.ingressProcessor.stop(false);
      await runtime.egressProcessor.stop(false);
      runtime.jitter.clear();
      runtime.preRoll.clear();
      runtime.ingress.clear();
      runtime.egress.clear();
      runtime.greetingStatus =
        runtime.greetingStatus === "started"
          ? "interrupted"
          : runtime.greetingStatus;
      const protocol = runtime.adapter.getProtocolMetrics?.();
      if (
        protocol &&
        (protocol.unknownPacketTypes ||
          protocol.unsupportedAudioPackets ||
          protocol.malformedPackets)
      )
        await this.audit.append({
          tenantId,
          traceId,
          actorType: "service",
          eventType: "audiosocket_packet_unsupported" as any,
          entityType: "voice_media_session",
          entityId: String(id),
          decision: "ignored",
          details: {
            unknownPacketTypes: protocol.unknownPacketTypes,
            unsupportedAudioPackets: protocol.unsupportedAudioPackets,
            malformedPackets: protocol.malformedPackets,
            protocolErrors: protocol.protocolErrors,
          },
        });
      runtime.barge.reset();
      await runtime.adapter.stop();
      await runtime.flusher.final(1000);
      this.runtimes.delete(id);
    }
    const row = await this.row(tenantId, id);
    if (!["completed", "failed", "cancelled"].includes(row.state)) {
      if (["streaming", "paused"].includes(row.state))
        await this.transition(tenantId, id, "draining", traceId);
      await this.transition(tenantId, id, terminal, traceId);
    }
    await this.store.query(
      "UPDATE ai_voice_sessions v JOIN ai_voice_media_sessions m ON m.voice_session_id=v.id SET v.media_state='disconnected' WHERE m.tenant_id=? AND m.id=?",
      [tenantId, id],
    );
    return this.get(tenantId, id);
  }
  async fail(tenantId: number, id: number, traceId: string, code: string) {
    const runtime = this.runtimes.get(id);
    if (runtime) {
      runtime.stopping = true;
      runtime.unsubscribe();
      runtime.aborter.abort();
      await runtime.ingressProcessor.stop(false);
      await runtime.egressProcessor.stop(false);
      await runtime.adapter.stop();
      await runtime.flusher.final(1000);
      this.runtimes.delete(id);
    }
    await this.transition(tenantId, id, "failed", traceId, code);
    return this.get(tenantId, id);
  }
  async closeForVoiceSession(
    tenantId: number,
    voiceSessionId: number,
    traceId: string,
  ) {
    const row = (await this.repo.findActive(tenantId, voiceSessionId))[0];
    return row ? this.stop(tenantId, Number(row.id), traceId) : null;
  }
  activeCount() {
    return this.runtimes.size;
  }
  setProviderCloser(
    closer: (
      tenantId: number,
      mediaSessionId: number,
      traceId: string,
    ) => Promise<unknown>,
  ) {
    this.providerCloser = closer;
  }
  setDurationCloser(
    closer: (tenantId:number,mediaSessionId:number,traceId:string)=>Promise<unknown>,
  ) {
    this.durationCloser = closer;
  }
  async shutdown() {
    for (const [id, runtime] of [...this.runtimes])
      await this.stop(runtime.tenantId, id, "shutdown", "cancelled").catch(
        () => {},
      );
  }
}
