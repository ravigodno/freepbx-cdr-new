import assert from "node:assert/strict";
import fs from "node:fs";
import { SyntheticRealtimeVoiceAdapter } from "../server/ai-platform/voice/providers/adapters/syntheticRealtimeVoiceAdapter.js";
import {
  OpenAIRealtimeAdapter,
  readOpenAIRealtimeConfig,
  splitOpenAIOutputAudio,
} from "../server/ai-platform/voice/providers/adapters/openaiRealtimeAdapter.js";
import { RealtimeVoiceProviderRegistry } from "../server/ai-platform/voice/providers/realtimeVoiceProviderRegistry.js";
import {
  callbackIntent,
  composeRealtimeInstructions,
  detectRealtimeTransfer,
} from "../server/ai-platform/voice/providers/realtimeVoicePolicy.js";
import { normalizeOpenAIRealtimeEvent } from "../server/ai-platform/voice/providers/realtimeVoiceEventNormalizer.js";
import type { AudioFrame } from "../server/ai-platform/voice/media/mediaTypes.js";

const format = {
  codec: "slin16" as const,
  sampleRate: 16000,
  channels: 1 as const,
  frameDurationMs: 20,
};
const config = {
  providerKey: "synthetic",
  model: "synthetic-voice",
  language: "ru",
  voice: "natural",
  instructions: "safe",
  inputFormat: format,
  outputFormat: format,
  serverVad: false,
  tools: [
    {
      key: "pbx.get_active_calls",
      description: "Read active calls",
      inputSchema: { type: "object" },
    },
  ],
  timeoutMs: 1000,
};
const frame = (source: string): AudioFrame => ({
  sequence: 1,
  timestampMs: Date.now(),
  direction: "ingress",
  codec: "slin16",
  sampleRate: 16000,
  channels: 1,
  durationMs: 20,
  payload: new Uint8Array(640),
  source,
  traceId: "test",
  voiceSessionId: 1,
  mediaSessionId: 1,
});

async function run() {
  const openAIConfig = readOpenAIRealtimeConfig();
  if (!process.env.PBXPULS_OPENAI_REALTIME_MODEL)
    assert.equal(openAIConfig.model, "gpt-realtime-2.1");
  const largeProviderDelta = Buffer.alloc(31_200);
  const providerChunks = splitOpenAIOutputAudio(largeProviderDelta);
  const providerFrame = (payload: Uint8Array) => ({ payload });
  assert.deepEqual(
    providerChunks.map((chunk) => chunk.byteLength),
    [9_600, 9_600, 9_600, 2_400],
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      {type:"conversation.item.input_audio_transcription.delta",delta:"Как",event_id:"event-partial",item_id:"item-1"},
      providerFrame,
    ),
    {type:"transcript",kind:"input_partial",text:"Как",eventId:"event-partial",itemId:"item-1"},
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      {type:"response.output_text.delta",delta:"Сформированный текст"},providerFrame,
    ),
    {type:"transcript",kind:"output_generated_partial",text:"Сформированный текст"},
  );
  assert.equal(normalizeOpenAIRealtimeEvent({type:"conversation.item.input_audio_transcription.failed",error:{code:"transcription_failed"}},providerFrame)?.type,"transcript_unavailable");
  const usageEvent:any=normalizeOpenAIRealtimeEvent({type:"response.done",response:{status:"completed",usage:{input_token_details:{audio_tokens:12},output_token_details:{audio_tokens:8}}}},providerFrame);
  assert.equal(usageEvent.usage.input_token_details.audio_tokens,12);
  assert.equal(Buffer.concat(providerChunks).equals(largeProviderDelta), true);
  assert.equal(
    normalizeOpenAIRealtimeEvent(
      { type: "response.output_audio.delta", delta: "AAE=" },
      providerFrame,
    )?.type,
    "output_audio",
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      { type: "response.output_audio_transcript.done", transcript: "Готово" },
      providerFrame,
    ),
    { type: "transcript", kind: "output_final", text: "Готово" },
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      {
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Как меня слышно?",
      },
      providerFrame,
    ),
    { type: "transcript", kind: "input_final", text: "Как меня слышно?" },
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      {
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "",
      },
      providerFrame,
    ),
    { type: "transcript", kind: "input_final", text: "" },
  );
  assert.equal(
    normalizeOpenAIRealtimeEvent(
      { type: "response.done", response: { status: "cancelled" } },
      providerFrame,
    )?.type,
    "response_cancelled",
  );
  assert.equal(
    normalizeOpenAIRealtimeEvent(
      { type: "response.done", response: { status: "completed" } },
      providerFrame,
    )?.type,
    "response_completed",
  );
  assert.deepEqual(
    normalizeOpenAIRealtimeEvent(
      { type: "error", error: { code: "invalid_value" } },
      providerFrame,
    ),
    { type: "error", errorCode: "invalid_value" },
  );
  const registry = new RealtimeVoiceProviderRegistry();
  registry.register("synthetic", () => new SyntheticRealtimeVoiceAdapter());
  registry.register("openai_realtime", () => new OpenAIRealtimeAdapter());
  assert.equal(registry.list().length, 2);
  assert.equal(
    registry.create("synthetic").getCapabilities().speechToSpeech,
    true,
  );
  assert.equal(
    registry.create("openai_realtime").getCapabilities().tools,
    false,
  );
  assert.throws(() => registry.create("unknown"), /Unknown/);
  const adapter = new SyntheticRealtimeVoiceAdapter(),
    events: any[] = [];
  adapter.subscribeEvents((event) => events.push(event));
  const controller = new AbortController();
  assert.equal((await adapter.validateConfig(config)).valid, true);
  await adapter.connect(config, controller.signal);
  await adapter.configureSession(config);
  await adapter.appendAudio(frame("question"));
  await adapter.commitInput();
  assert(events.some((event) => event.type === "output_audio"));
  assert(
    events.some(
      (event) => event.type === "transcript" && event.kind === "input_final",
    ),
  );
  assert(
    events
      .filter((event) => event.type === "output_audio")
      .every((event) => event.frame.payload.byteLength > 0),
  );
  events.length = 0;
  await adapter.appendAudio(frame("tool_query"));
  await adapter.commitInput();
  assert(
    events.some(
      (event) =>
        event.type === "tool_call" && event.toolKey === "pbx.get_active_calls",
    ),
  );
  assert(!events.some((event) => event.executorKey));
  events.length = 0;
  await adapter.appendAudio(frame("callback_request"));
  await adapter.commitInput();
  assert(
    events.some(
      (event) => event.type === "transcript" && callbackIntent(event.text),
    ),
  );
  events.length = 0;
  await adapter.appendAudio(frame("transfer_request"));
  await adapter.commitInput();
  assert(
    events.some(
      (event) =>
        event.type === "transcript" && detectRealtimeTransfer(event.text),
    ),
  );
  events.length = 0;
  await adapter.startInitialGreeting("Здравствуйте. Чем могу помочь?");
  assert.equal(
    events.filter((event) => event.type === "response_started").length,
    1,
  );
  assert.equal(
    events.filter((event) => event.type === "output_audio").length,
    3,
  );
  assert(
    events.some(
      (event) =>
        event.type === "transcript" &&
        event.text === "Здравствуйте. Чем могу помочь?",
    ),
  );
  await adapter.cancelResponse();
  assert.equal(adapter.getHealth().state, "connected");
  await adapter.close();
  assert.equal(adapter.getHealth().state, "disconnected");
  const instructions = composeRealtimeInstructions(
    {
      agent: { name: "Receptionist", type: "receptionist", version: { id: 3 } },
      behavior: { responseStyle: { response_style: "natural" } },
    },
    "ru",
  );
  assert.equal(instructions.checksum.length, 64);
  assert.match(instructions.instructions, /1–3/);
  assert.doesNotMatch(instructions.instructions, /password|api[_ -]?key/i);
  const openai = new OpenAIRealtimeAdapter();
  const missing = { ...config, providerKey: "openai_realtime", apiKey: "" };
  assert.equal((await openai.validateConfig(missing)).valid, false);
  assert.equal(
    readOpenAIRealtimeConfig().configured,
    Boolean(process.env.OPENAI_API_KEY),
  );
  const router = fs.readFileSync(
      "server/ai-platform/voice/providers/api/realtimeVoiceRouter.ts",
      "utf8",
    ),
    migration = fs.readFileSync("server/pbxpulsMigrations.ts", "utf8"),
    service = fs.readFileSync(
      "server/ai-platform/voice/providers/realtimeVoiceSessionService.ts",
      "utf8",
    ), transcriptService=fs.readFileSync("server/ai-platform/voice/transcripts/voiceTranscriptService.ts","utf8"), transcriptRouter=fs.readFileSync("server/ai-platform/voice/transcripts/api/voiceTranscriptRouter.ts","utf8");
  assert.match(router, /Raw audio payload is forbidden/);
  assert.doesNotMatch(router, /apiKey|Authorization|providerSessionIdHash/);
  assert.match(migration, /ai\.realtime_voice_enabled','false/);
  assert.match(migration, /ai\.realtime_voice_provider','synthetic/);
  assert.match(service, /transferRequired\s*=\s*true/);
  assert.match(service, /toolCalls\s*>\s*2/);
  assert.match(service, /greetingStatus\s*!==\s*["']not_started["']/);
  assert.doesNotMatch(
    service,
    /asterisk\s+-rx|external_host|createBridge|answerChannel/i,
  );
  assert.match(transcriptService,/spoken_text_safe/);
  assert.match(transcriptService,/incomplete=1/);
  assert.match(transcriptService,/redactAiPlatformText/);
  assert.doesNotMatch(transcriptService+transcriptRouter,/input_audio_buffer|base64|Authorization|OPENAI_API_KEY|raw PCM/i);
  assert.match(transcriptRouter,/text\/event-stream/);
  assert.match(transcriptRouter,/export_ai_voice_transcripts/);
  console.log("AI Platform realtime voice tests passed");
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
