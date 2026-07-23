import assert from "node:assert/strict";
import fs from "node:fs";
import { CodecRegistry } from "../server/ai-platform/voice/media/codecRegistry.js";
import {
  AudioResampler,
  StreamingPcm16To8Downsampler,
} from "../server/ai-platform/voice/media/audioResampler.js";
import {
  AudioPacketizer,
  PACKETIZATION_ERROR_THRESHOLD,
} from "../server/ai-platform/voice/media/audioPacketizer.js";
import { JitterBuffer } from "../server/ai-platform/voice/media/jitterBuffer.js";
import { BackpressureController } from "../server/ai-platform/voice/media/backpressureController.js";
import { BoundedSerialProcessor } from "../server/ai-platform/voice/media/boundedSerialProcessor.js";
import { MetricsFlusher } from "../server/ai-platform/voice/media/metricsFlusher.js";
import { VadDetector } from "../server/ai-platform/voice/media/vadDetector.js";
import { BargeInController } from "../server/ai-platform/voice/media/bargeInController.js";
import { MediaTransportRegistry } from "../server/ai-platform/voice/media/mediaTransportRegistry.js";
import { SyntheticMediaAdapter } from "../server/ai-platform/voice/media/transports/syntheticMediaAdapter.js";
import { ExternalMediaAdapter } from "../server/ai-platform/voice/media/transports/externalMediaAdapter.js";
import { AudioSocketAdapter } from "../server/ai-platform/voice/media/transports/audioSocketAdapter.js";
import { MediaSessionService } from "../server/ai-platform/voice/media/mediaSessionService.js";
import type { AudioFrame } from "../server/ai-platform/voice/media/mediaTypes.js";
import { readVoiceDurationPolicy } from "../server/ai-platform/voice/media/voiceDurationPolicy.js";
import {
  decodeUlawToPcm16,
  encodePcm16ToUlaw,
} from "../server/ai-platform/voice/media/g711.js";

const codecs = new CodecRegistry();
assert.equal(codecs.supportsDecode("ulaw"), true);
assert.equal(codecs.supportsEncode("alaw"), true);
assert.equal(codecs.supportsDecode("opus"), false);
assert.throws(() =>
  codecs.negotiate({
    codec: "opus",
    sampleRate: 48000,
    channels: 1,
    frameDurationMs: 20,
  }),
);
const resampler = new AudioResampler(),
  pcm8 = new Int16Array([0, 1000, -1000, 500]);
assert.equal(resampler.resamplePcm16(pcm8, 8000, 16000).length, 8);
assert.equal(resampler.resamplePcm16(new Int16Array(8), 16000, 8000).length, 4);
assert.equal(
  resampler.resamplePcm16(new Int16Array(320), 16000, 24000).length,
  480,
);
assert.equal(
  resampler.resamplePcm16(new Int16Array(480), 24000, 16000).length,
  320,
);
const g711Source = Int16Array.from([-30000, -10000, -1000, 0, 1000, 10000, 30000]),
  g711Encoded = encodePcm16ToUlaw(g711Source),
  g711Decoded = decodeUlawToPcm16(g711Encoded);
assert.equal(g711Encoded.length, g711Source.length);
assert.equal(g711Decoded.length, g711Source.length);
assert.equal(g711Decoded[3], 0);
assert.ok(g711Decoded[0] < 0 && g711Decoded[6] > 0);
const antiAliasDownsampler = new StreamingPcm16To8Downsampler(),
  nyquist = Int16Array.from({ length: 320 }, (_, index) =>
    index % 2 ? -10000 : 10000,
  ),
  filtered = antiAliasDownsampler.process(nyquist);
assert.equal(filtered.length, 160);
assert.ok(Math.max(...filtered.slice(40).map(Math.abs)) < 100);
assert.equal(antiAliasDownsampler.process(new Int16Array(320)).length, 160);
const speechBandDownsampler = new StreamingPcm16To8Downsampler(),
  speechBand = Int16Array.from({ length: 1600 }, (_, index) =>
    Math.round(10000 * Math.sin((2 * Math.PI * 3000 * index) / 16000)),
  ),
  speechBandFiltered = speechBandDownsampler.process(speechBand),
  speechBandPeak = Math.max(...speechBandFiltered.slice(40).map(Math.abs));
assert.ok(speechBandPeak > 8500);
const packetizerContext = {
    source: "test",
    traceId: "trace",
    voiceSessionId: 3,
    mediaSessionId: 1,
  },
  pcm = (sampleCount: number, offset = 0) => {
    const payload = Buffer.alloc(sampleCount * 2);
    for (let index = 0; index < sampleCount; index++)
      payload.writeInt16LE(offset + index, index * 2);
    return payload;
  },
  packetize = (
    packetizer: AudioPacketizer,
    durationMs: number,
    sampleRate: 8000 | 16000 | 24000 = 8000,
    timestampMs = 1000,
  ) =>
    packetizer.pushPcm(
      pcm((sampleRate * durationMs) / 1000),
      { codec: "slin16", sampleRate, channels: 1 },
      timestampMs,
      packetizerContext,
    );
for (const [duration, expected] of [
  [20, 1],
  [40, 2],
  [60, 3],
] as const) {
  const subject = new AudioPacketizer(),
    frames = packetize(subject, duration);
  assert.equal(frames.length, expected);
  assert.ok(
    frames.every(
      (item) =>
        item.durationMs === 20 &&
        item.sampleRate === 16000 &&
        item.channels === 1 &&
        item.payload.byteLength === 640,
    ),
  );
}
const providerPacketizer = new AudioPacketizer(),
  providerFrames = packetize(providerPacketizer, 40, 24000);
assert.equal(providerFrames.length, 2);
assert.ok(
  providerFrames.every(
    (item) =>
      item.sampleRate === 16000 &&
      item.durationMs === 20 &&
      item.payload.byteLength === 640,
  ),
);
const native8kFrames = packetize(new AudioPacketizer(8000), 40, 8000);
assert.equal(native8kFrames.length, 2);
assert.ok(
  native8kFrames.every(
    (item) => item.sampleRate === 8000 && item.payload.byteLength === 320,
  ),
);
const splitThirtyTen = new AudioPacketizer(),
  firstThirty = packetize(splitThirtyTen, 30, 8000, 2000),
  nextTen = packetize(splitThirtyTen, 10, 8000, 2030);
assert.equal(firstThirty.length, 1);
assert.equal(nextTen.length, 1);
assert.equal(nextTen[0].sequence, firstThirty[0].sequence + 1);
assert.equal(nextTen[0].timestampMs, firstThirty[0].timestampMs + 20);
const splitTenTen = new AudioPacketizer();
assert.equal(packetize(splitTenTen, 10).length, 0);
assert.equal(packetize(splitTenTen, 10).length, 1);
const ordered = new AudioPacketizer(),
  orderedFrames = ordered.pushPcm(
    pcm(640, -1000),
    { codec: "slin16", sampleRate: 16000, channels: 1 },
    3000,
    packetizerContext,
  );
assert.equal(orderedFrames.length, 2);
assert.equal(Buffer.from(orderedFrames[0].payload).readInt16LE(0), -1000);
assert.equal(Buffer.from(orderedFrames[1].payload).readInt16LE(0), -680);
assert.equal(orderedFrames[1].timestampMs, 3020);
const partial = new AudioPacketizer();
packetize(partial, 10);
assert.equal(partial.getMetrics().remainderBytes, 320);
assert.deepEqual(partial.flush(), []);
assert.equal(partial.getMetrics().partialFrameDropped, 1);
assert.equal(partial.getMetrics().remainderBytes, 0);
const malformed = new AudioPacketizer();
assert.deepEqual(
  malformed.pushPcm(
    Buffer.alloc(319),
    { codec: "slin16", sampleRate: 8000, channels: 1 },
    0,
    packetizerContext,
  ),
  [],
);
assert.equal(malformed.getMetrics().oddLengthPackets, 1);
assert.deepEqual(
  malformed.pushPcm(
    Buffer.alloc(3202),
    { codec: "slin16", sampleRate: 8000, channels: 1 },
    0,
    packetizerContext,
  ),
  [],
);
assert.equal(malformed.getMetrics().oversizedPackets, 1);
for (let index = 2; index < PACKETIZATION_ERROR_THRESHOLD; index++)
  malformed.pushPcm(
    Buffer.alloc(1),
    { codec: "slin16", sampleRate: 8000, channels: 1 },
    0,
    packetizerContext,
  );
assert.equal(
  malformed.getMetrics().consecutivePacketizationErrors,
  PACKETIZATION_ERROR_THRESHOLD,
);
const frame = (sequence: number, timestampMs = Date.now()): AudioFrame => ({
  sequence,
  timestampMs,
  direction: "ingress",
  codec: "slin16",
  sampleRate: 16000,
  channels: 1,
  durationMs: 20,
  payload: new Uint8Array(640),
  source: "test",
  traceId: "trace",
  voiceSessionId: 3,
  mediaSessionId: 1,
});
const jitter = new JitterBuffer(40, 80, 20);
jitter.push(frame(1));
jitter.push(frame(3));
const reordered = jitter.push(frame(2));
assert.ok(reordered.length >= 1);
assert.ok(jitter.metrics().reordered >= 1);
jitter.push(frame(2));
assert.ok(jitter.metrics().duplicates + jitter.metrics().dropped >= 1);
for (let i = 10; i < 30; i++) jitter.push(frame(i));
assert.ok(jitter.metrics().dropped > 0);
jitter.drain(true);
jitter.clear();
const pressure = new BackpressureController<number>(4, 3, 1);
for (let i = 0; i < 10; i++) pressure.push(i);
assert.equal(pressure.depth(), 4);
assert.equal(pressure.dropped, 6);
assert.ok(pressure.memoryEstimate(8) <= 32);
while (pressure.shift() !== undefined) {}
assert.equal(pressure.paused, false);
const processed: number[] = [],
  serial = new BoundedSerialProcessor<number>(
    async (value) => {
      processed.push(value);
    },
    { capacity: 20, batchSize: 8 },
  );
serial.start();
for (let i = 0; i < 1000; i++) serial.enqueue(i);
await serial.drain();
const serialMetrics = serial.getMetrics();
assert.equal(serialMetrics.peak, 20);
assert.equal(serialMetrics.dropped, 980);
assert.equal(serialMetrics.processed, 20);
assert.deepEqual(
  processed,
  [...processed].sort((a, b) => a - b),
);
await serial.stop();
let flushCalls = 0,
  concurrentFlushes = 0,
  maxConcurrentFlushes = 0;
const flusher = new MetricsFlusher(async () => {
  flushCalls++;
  concurrentFlushes++;
  maxConcurrentFlushes = Math.max(maxConcurrentFlushes, concurrentFlushes);
  await new Promise((resolve) => setImmediate(resolve));
  concurrentFlushes--;
}, 1000);
for (let i = 0; i < 1000; i++) flusher.markDirty();
await flusher.flush();
assert.equal(flushCalls, 1);
assert.equal(maxConcurrentFlushes, 1);
await flusher.final();
assert.ok(flusher.getMetrics().metricsFlushCount >= 1);
const vad = new VadDetector(500, 2, 40),
  silence = new Int16Array(320),
  speech = new Int16Array(320).fill(5000);
assert.equal(vad.process(silence).type, "silence");
vad.process(speech);
assert.equal(vad.process(speech).type, "speech_started");
assert.equal(vad.state(), "speech");
assert.equal(vad.process(silence).type, "silence");
assert.equal(vad.state(), "speech");
assert.equal(vad.process(silence).type, "speech_ended");
assert.equal(vad.state(), "silence");
const barge = new BargeInController(),
  controller = new AbortController();
barge.onPlaybackStarted(controller);
assert.equal(barge.onSpeechStarted(), true);
assert.equal(controller.signal.aborted, true);
assert.equal(barge.count, 1);
const registry = new MediaTransportRegistry();
registry.register(new SyntheticMediaAdapter());
registry.register(new ExternalMediaAdapter());
registry.register(new AudioSocketAdapter());
assert.equal(registry.list().length, 3);
assert.equal(registry.get("external_media").getCapabilities().available, false);
const audioCapabilities = registry
  .get("audiosocket")
  .getCapabilities().audioSocketProtocol!;
assert.deepEqual(audioCapabilities.supportedInboundPacketTypes, [0x10, 0x12]);
assert.equal(audioCapabilities.preferredAsteriskPacketType, 0x10);
assert.equal(audioCapabilities.preferredAsteriskSampleRate, 8000);
assert.equal(audioCapabilities.internalSampleRate, 8000);
assert.equal(audioCapabilities.resamplingRequired, false);
await assert.rejects(() => registry.get("audiosocket").start());

class Store {
  sessions: any[] = [];
  voices = [
    { id: 3, tenant_id: 1, state: "active", media_state: "not_configured" },
  ];
  audits: any[] = [];
  next = 1;
  async query(sql: string, params: any[] = []): Promise<any> {
    if (sql.includes("SELECT id,state FROM ai_voice_sessions"))
      return this.voices.filter(
        (row) => row.tenant_id === params[0] && row.id === params[1],
      );
    if (
      sql.startsWith("SELECT * FROM ai_voice_media_sessions") &&
      sql.includes("voice_session_id")
    )
      return this.sessions.filter(
        (row) =>
          row.tenant_id === params[0] &&
          row.voice_session_id === params[1] &&
          !["completed", "failed", "cancelled"].includes(row.state),
      );
    if (
      sql.startsWith("SELECT * FROM ai_voice_media_sessions") &&
      sql.includes("id=?")
    )
      return this.sessions.filter(
        (row) => row.tenant_id === params[0] && row.id === params[1],
      );
    if (sql.startsWith("SELECT * FROM ai_voice_media_sessions"))
      return this.sessions.filter((row) => row.tenant_id === params[0]);
    if (sql.startsWith("INSERT INTO ai_voice_media_sessions")) {
      const row = {
        id: this.next++,
        tenant_id: params[0],
        voice_session_id: params[1],
        transport_mode: params[2],
        state: "created",
        codec_in: params[3],
        codec_out: params[4],
        sample_rate_in: params[5],
        sample_rate_out: params[6],
        channels_in: params[7],
        channels_out: params[8],
        frame_duration_ms: params[9],
        ingress_frames: 0,
        egress_frames: 0,
        ingress_bytes: 0,
        egress_bytes: 0,
        dropped_frames: 0,
        reordered_frames: 0,
        duplicate_frames: 0,
        jitter_ms_avg: null,
        jitter_ms_p95: null,
        ingress_latency_ms_avg: null,
        egress_latency_ms_avg: null,
        first_audio_at: null,
        last_audio_at: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        failure_code: null,
        metadata_json: "{}",
      };
      this.sessions.push(row);
      return { insertId: row.id, affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ai_voice_media_sessions SET state=")) {
      const row = this.sessions.find(
        (item) =>
          item.tenant_id === params[3] &&
          item.id === params[4] &&
          item.state === params[5],
      );
      if (!row) return { affectedRows: 0 };
      row.state = params[0];
      row.failure_code = params[1];
      if (["completed", "failed", "cancelled"].includes(params[2]))
        row.ended_at = new Date().toISOString();
      return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ai_voice_media_sessions SET ingress_frames=")) {
      const row = this.sessions.find(
        (item) => item.tenant_id === params[14] && item.id === params[15],
      );
      Object.assign(row, {
        ingress_frames: params[0],
        egress_frames: params[1],
        ingress_bytes: params[2],
        egress_bytes: params[3],
        dropped_frames: params[4],
        reordered_frames: params[5],
        duplicate_frames: params[6],
        jitter_ms_avg: params[7],
        jitter_ms_p95: params[8],
        ingress_latency_ms_avg: params[9],
        egress_latency_ms_avg: params[10],
        first_audio_at: params[11],
        last_audio_at: params[12],
        metadata_json: params[13],
      });
      return { affectedRows: 1 };
    }
    if (sql.startsWith("UPDATE ai_voice_sessions SET media_state=")) {
      const row = this.voices.find(
        (item) => item.tenant_id === params[0] && item.id === params[1],
      );
      if (row) row.media_state = "connected";
      return { affectedRows: row ? 1 : 0 };
    }
    if (sql.startsWith("UPDATE ai_voice_sessions v JOIN")) {
      const media = this.sessions.find(
          (item) => item.tenant_id === params[0] && item.id === params[1],
        ),
        row = this.voices.find((item) => item.id === media?.voice_session_id);
      if (row) row.media_state = "disconnected";
      return { affectedRows: row ? 1 : 0 };
    }
    if (sql.startsWith("INSERT INTO ai_audit_log")) {
      this.audits.push(params);
      return { insertId: this.next++, affectedRows: 1 };
    }
    return [];
  }
}
const store = new Store(),
  audit = { append: async (event: any) => store.audits.push(event) } as any;
const disabled = new MediaSessionService(
  store as any,
  audit,
  registry,
  async () => false,
);
await assert.rejects(
  () =>
    disabled.createSynthetic({
      tenantId: 1,
      voiceSessionId: 3,
      traceId: "disabled",
    }),
  (error: any) => error.code === "feature_disabled",
);
const service = new MediaSessionService(
    store as any,
    audit,
    registry,
    async () => true,
  ),
  created = await service.createSynthetic({
    tenantId: 1,
    voiceSessionId: 3,
    traceId: "trace",
  });
assert.equal(created.state, "streaming");
assert.equal(store.voices[0].media_state, "connected");
await assert.rejects(
  () =>
    service.createSynthetic({
      tenantId: 1,
      voiceSessionId: 3,
      traceId: "duplicate",
    }),
  (error: any) => error.code === "conflict",
);
await assert.rejects(() => service.get(2, created.id));
await service.fixture(1, created.id, "silence", 5, "trace");
await service.fixture(1, created.id, "reordered_sequence", 5, "trace");
await service.fixture(1, created.id, "duplicate_sequence", 5, "trace");
await service.fixture(1, created.id, "packet_loss", 6, "trace");
const barged = await service.bargeIn(1, created.id, "trace");
assert.ok(barged.bargeInCount >= 1);
assert.ok(barged.egressFrames >= 1);
assert.ok(barged.memoryEstimateBytes <= 128000);
const completed = await service.stop(1, created.id, "trace");
assert.equal(completed.state, "completed");
assert.equal(store.voices[0].media_state, "disconnected");
await service.stop(1, created.id, "trace");
assert.equal(service.activeCount(), 0);
assert.ok(
  store.audits.some((event) => event.eventType === "media_session_created"),
);
assert.ok(
  store.audits.some((event) => event.eventType === "barge_in_detected"),
);
assert.doesNotMatch(JSON.stringify(store.sessions), /payload|base64|rawAudio/i);
assert.doesNotMatch(JSON.stringify(store.audits), /payload|base64|rawAudio/i);
const router = fs.readFileSync(
    "server/ai-platform/voice/media/api/mediaRouter.ts",
    "utf8",
  ),
  external = fs.readFileSync(
    "server/ai-platform/voice/media/transports/externalMediaAdapter.ts",
    "utf8",
  ),
  socket = fs.readFileSync(
    "server/ai-platform/voice/media/transports/audioSocketAdapter.ts",
    "utf8",
  ),
  mediaService = fs.readFileSync(
    "server/ai-platform/voice/media/mediaSessionService.ts",
    "utf8",
  );
assert.match(router, /Raw audio payload is forbidden/);
assert.match(router, /view_ai_voice_media_status/);
assert.match(router, /test_ai_voice_media/);
assert.doesNotMatch(router, /res\.json\([^\n]*payload/);
assert.match(external, /feature_disabled/);
assert.match(socket, /PBXPULS_AI_AUDIOSOCKET_PORT/);
assert.match(socket, /127\.0\.0\.1/);
assert.doesNotMatch(external + socket, /0\.0\.0\.0/);
assert.match(mediaService, /INGRESS_CAPTURE_CAPACITY_FRAMES = 3000/);
const productionPolicy=await readVoiceDurationPolicy({query:async()=>[
  {setting_key:"ai.voice_max_call_duration_seconds",setting_value:"1800"},
  {setting_key:"ai.voice_duration_warning_seconds",setting_value:"60"},
]} as any);
assert.equal(productionPolicy.maxCallDurationSeconds,1800);
assert.equal((await readVoiceDurationPolicy({query:async()=>[{setting_key:"ai.voice_max_call_duration_seconds",setting_value:"99999"}]} as any)).maxCallDurationSeconds,7200);
assert.equal((await readVoiceDurationPolicy({query:async()=>[{setting_key:"ai.voice_max_call_duration_seconds",setting_value:"1"}]} as any)).maxCallDurationSeconds,60);
assert.match(mediaService,/runtime\.syntheticSafetyLimit && runtime\.events >= 3000/);
assert.doesNotMatch(mediaService,/Date\\.now\\(\\) - runtime\\.started > 60_000/);
assert.match(mediaService,/completion_reason='duration_limit'/);
assert.match(mediaService, /jitterDropped: jitter\.dropped/);
assert.match(mediaService, /egressQueueDropped: egressQueue\.dropped/);
console.log("AI Platform Voice Media tests: OK");
