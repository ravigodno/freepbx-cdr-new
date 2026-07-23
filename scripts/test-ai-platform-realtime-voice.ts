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
import { estimateVoiceCost, projectSafeVoiceUsage } from "../server/ai-platform/voice/transcripts/voiceUsageProjection.js";
import { containsInternalAgentDisclosure, customerSafeToolResult, isUnexpectedEnglishVoiceResponse } from "../server/ai-platform/voice/providers/voiceOutputGuard.js";
import {
  classifyCallerSpeech,
  extractStopCommand,
  VoiceTurnCoordinator,
} from "../server/ai-platform/voice/providers/voiceTurnCoordinator.js";
import { ProviderSilenceTracker } from "../server/ai-platform/voice/providers/providerSilenceMetrics.js";
import { VoiceTranscriptService } from "../server/ai-platform/voice/transcripts/voiceTranscriptService.js";
import {
  assessSemanticCompletion,
  decideResponseCompletion,
  receptionistResponseBudgets,
} from "../server/ai-platform/voice/providers/realtimeResponseCompletion.js";
import {
  createResponseStreamState,
  delayedStreamingPolicy,
  mayRetryBeforePlayout,
  pushResponseFrame,
  releaseResponseTail,
  releaseAfterPlayoutStarted,
  sentenceBoundaryAfterWarning,
} from "../server/ai-platform/voice/providers/delayedResponseStream.js";
import {
  compilePersonalityInstructions,
  receptionistPersonalityV10,
  validatePersonalityProfile,
} from "../server/ai-platform/agents/agentPersonalityProfile.js";
import {
  compileTaskStateInstructions,
  createTaskState,
  isFarewellIntent,
  updateTaskState,
} from "../server/ai-platform/voice/providers/receptionistConversationState.js";

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
  const personality=receptionistPersonalityV10();
  assert.deepEqual(validatePersonalityProfile(personality),[]);
  assert.match(compilePersonalityInstructions(personality),/говори немного быстрее/iu);
  const task=createTaskState();
  updateTaskState(task,"Запишите меня к врачу завтра");
  assert.equal(task.collectedFields.date,"завтра");
  assert.equal(task.nextBestQuestion,"На какое время вас записать?");
  updateTaskState(task,"Завтра в 14:30");
  assert.equal(task.nextBestQuestion,null);
  assert.match(compileTaskStateInstructions(task),/не спрашивай повторно/iu);
  assert.equal(isFarewellIntent("Спасибо, до свидания"),true);
  const audible = (
    providerState: "generating" | "provider_done" = "generating",
    queuedAudioMs = 5000,
  ) => {
    const coordinator = new VoiceTurnCoordinator();
    coordinator.providerResponseStarted("response-safe");
    coordinator.playoutStarted({
      responseRef: "response-safe",
      queuedAudioMs,
      now: 1000,
    });
    if (providerState === "provider_done")
      coordinator.providerResponseDone("response-safe");
    return coordinator;
  };
  for (const [text,category] of [
    ["угу","acknowledgement"],
    ["да","acknowledgement"],
    ["ха-ха","laughter"],
    ["кхм","cough"],
    ["вдох","breath"],
    ["шум","noise"],
  ] as const) {
    const turn=audible("provider_done",5000);
    turn.beginCallerTurn();
    turn.callerSpeechStarted({energy:900},1300);
    const decision=turn.transcriptPartial(text,2300);
    assert.equal(decision.status,"rejected");
    assert.equal(decision.category,category);
    assert.equal(turn.counters.confirmedBargeInCount,0);
  }
  let turn=audible("generating",5000);
  turn.beginCallerTurn();
  turn.callerSpeechStarted({energy:900},1300);
  const substantive=turn.transcriptPartial("Мне нужен точный адрес",2000);
  assert.equal(substantive.status,"confirmed");
  assert.equal(substantive.cancelMode,"provider_and_playout");
  assert.equal(turn.counters.confirmedBargeInCount,1);
  turn=audible("provider_done",1400);
  turn.beginCallerTurn();
  turn.callerSpeechStarted({energy:900},1300);
  assert.equal(
    turn.transcriptPartial("Мне нужен точный адрес",2000).reason,
    "remaining_audio_low",
  );
  turn=audible("provider_done",5000);
  turn.beginCallerTurn();
  turn.callerSpeechStarted({energy:900},1300);
  const stop=turn.transcriptPartial(
    "Стоп, другой вопрос: где вы находитесь?",
    1350,
  );
  assert.equal(stop.status,"confirmed");
  assert.equal(stop.fastPath,true);
  assert.equal(stop.cancelMode,"playout_only");
  assert.equal(stop.semanticRemainder,"где вы находитесь?");
  const duplicate=turn.transcriptPartial(
    "Стоп, другой вопрос: где вы находитесь?",
    1360,
  );
  assert.equal(duplicate.status,"rejected");
  assert.equal(turn.counters.confirmedBargeInCount,1);
  assert.equal(turn.counters.duplicateInterruptionPrevented,1);
  assert.deepEqual(
    extractStopCommand("Стоп, другой вопрос: какой адрес?"),
    {keyword:"стоп",semanticRemainder:"какой адрес?"},
  );
  assert.equal(classifyCallerSpeech("ага"),"acknowledgement");
  assert.equal(classifyCallerSpeech("Мне нужен адрес"),"substantive_speech");
  for(const text of [
    "Здравствуйте. Чем могу",
    "Да, вас",
    "Хорошо, да",
    "Я могу помочь с",
  ]) assert.equal(assessSemanticCompletion(text).complete,false,text);
  for(const text of [
    "Да, я вас хорошо слышу.",
    "Хорошо, на какое время вас записать?",
    "Повторите, пожалуйста, вопрос.",
  ]) assert.equal(assessSemanticCompletion(text).complete,true,text);
  assert.deepEqual(
    receptionistResponseBudgets({
      voice:{
        maxGeneratedUnits:28,
        retryGeneratedUnits:999,
        greetingGeneratedUnits:1,
      },
    }),
    {response:160,retry:640,greeting:160},
  );
  assert.deepEqual(
    receptionistResponseBudgets({
      voice:{
        maxGeneratedUnits:320,
        retryGeneratedUnits:512,
        greetingGeneratedUnits:192,
      },
    }),
    {response:320,retry:512,greeting:192},
  );
  assert.equal(decideResponseCompletion({
    providerStatus:"incomplete",
    finishReason:"max_output_tokens",
    transcript:"Да, вас",
    retryCount:0,
  }).action,"retry");
  assert.equal(decideResponseCompletion({
    providerStatus:"incomplete",
    finishReason:"max_output_tokens",
    transcript:"Хорошо, да",
    retryCount:1,
  }).action,"play");
  assert.equal(decideResponseCompletion({
    providerStatus:"completed",
    finishReason:"completed",
    transcript:"Да, я вас хорошо слышу.",
    retryCount:1,
  }).action,"play");
  const delayedPolicy=delayedStreamingPolicy({
    voice:{
      delayedPlayoutStartupMs:500,
      softResponseSeconds:6,
      maxResponseAudioSeconds:12,
    },
  });
  assert.deepEqual(delayedPolicy,{
    startupBufferMs:500,
    warningMs:6000,
    hardMs:12000,
  });
  const stream=createResponseStreamState(),released:number[]=[];
  for(let index=0;index<200;index++){
    const next={...frame("provider"),sequence:index,durationMs:20};
    const result=pushResponseFrame(stream,next,500,index*20);
    released.push(...result.release.map(item=>item.sequence));
    if(index===24){
      assert.equal(result.startupReady,true);
      assert.equal(stream.framesSent,0);
      stream.framesSent+=result.release.length;
    }else if(result.release.length)stream.framesSent+=result.release.length;
  }
  assert.equal(released[0],0);
  assert.equal(released.at(-1),24);
  const afterStart=releaseAfterPlayoutStarted(stream);
  released.push(...afterStart.map(item=>item.sequence));
  stream.framesSent+=afterStart.length;
  assert.deepEqual(released,Array.from({length:200},(_,index)=>index));
  assert.equal(stream.startupBufferReadyAt,480);
  assert.equal(releaseResponseTail(stream,4000).length,0);
  assert.equal(mayRetryBeforePlayout({
    providerStatus:"incomplete",
    finishReason:"max_output_tokens",
    transcript:"Да, вас",
    retryCount:0,
    framesSent:0,
  }).retry,true);
  assert.equal(mayRetryBeforePlayout({
    providerStatus:"incomplete",
    finishReason:"max_output_tokens",
    transcript:"Да, вас",
    retryCount:0,
    framesSent:25,
  }).retry,false);
  const lengthState=createResponseStreamState();
  lengthState.generatedMs=6000;
  assert.equal(sentenceBoundaryAfterWarning(
    lengthState,"Да, я вас хорошо слышу.",6000,
  ),true);
  assert.equal(sentenceBoundaryAfterWarning(
    lengthState,"Следующее предложение.",6000,
  ),false);
  const completionFixtures=[
    {input:"Меня слышно?",response:"Да, я вас хорошо слышу и готов помочь с вашим вопросом.",durationMs:2800},
    {input:"Запишите меня на приём",response:"На какой день и время вас записать к выбранному специалисту?",durationMs:3200},
  ];
  for(const fixture of completionFixtures){
    const result=assessSemanticCompletion(fixture.response);
    assert.equal(result.complete,true,fixture.input);
    assert.ok(result.words>=8&&result.words<=16,fixture.response);
    assert.ok(fixture.durationMs>=2000&&fixture.durationMs<=5000);
    assert.ok(result.words<=30);
  }
  const transcriptQueries:Array<{sql:string;params:unknown[]}>=[],
    transcriptStore={
      query:async(sql:string,params:unknown[]=[])=>{
        transcriptQueries.push({sql,params});
        return sql.startsWith("SELECT id,sequence_no")
          ? [{id:7,sequence_no:3}]
          : {affectedRows:1};
      },
    },
    transcriptLifecycle=new VoiceTranscriptService(transcriptStore as any);
  await transcriptLifecycle.supersedeForRetry(1,2,"response-old");
  await transcriptLifecycle.bindRetryResponse(
    1,2,"response-old","response-retry",
  );
  assert.equal(
    transcriptQueries.filter(({sql})=>/\bINSERT\b/iu.test(sql)).length,
    0,
  );
  assert.ok(
    transcriptQueries.some(({sql})=>/superseded_by_retry=1/iu.test(sql)),
  );
  assert.ok(
    transcriptQueries.some(({sql})=>/provider_response_ref=\?/iu.test(sql)),
  );
  turn.beginCallerTurn();
  assert.equal(turn.requestResponseForTurn(),true);
  assert.equal(turn.requestResponseForTurn(),false);
  assert.equal(turn.counters.duplicateResponsePrevented,1);
  const liveStyle=audible("provider_done",5000);
  liveStyle.beginCallerTurn();
  liveStyle.callerSpeechStarted({energy:900},1300);
  assert.equal(liveStyle.transcriptPartial("ха-ха",2300).status,"rejected");
  liveStyle.beginCallerTurn();
  liveStyle.callerSpeechStarted({energy:900},2400);
  assert.equal(liveStyle.transcriptPartial("угу",3100).status,"rejected");
  liveStyle.beginCallerTurn();
  liveStyle.callerSpeechStarted({energy:900},3200);
  const liveStop=liveStyle.transcriptPartial(
    "Стоп, другой вопрос: какой адрес?",
    3250,
  );
  assert.equal(liveStop.status,"confirmed");
  assert.equal(liveStop.semanticRemainder,"какой адрес?");
  assert.equal(
    liveStyle.transcriptPartial("Стоп, другой вопрос: какой адрес?",3260).status,
    "rejected",
  );
  assert.equal(liveStyle.counters.confirmedBargeInCount,1);
  assert.equal(liveStyle.counters.laughterCount,1);
  assert.equal(liveStyle.counters.acknowledgementCount,1);
  const downstreamCanonicalCounters=[
    liveStyle.counters.confirmedBargeInCount,
    1, // media
    1, // realtime
    1, // transcript
    1, // audit
  ];
  assert.equal(new Set(downstreamCanonicalCounters).size,1);
  for(const sample of [
    "На какое время вас записать?",
    "Адрес пока не указан. Соединить с сотрудником?",
    "Сегодня работаем до восемнадцати часов.",
  ])
    assert.ok(
      (sample.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu)||[]).length<=18,
      sample,
    );
  const silence=new ProviderSilenceTracker(),
    silent=new Int16Array(320),
    voiced=new Int16Array(320).fill(2000);
  silence.record("response-safe",silent);
  silence.record("response-safe",silent);
  silence.record("response-safe",voiced);
  assert.deepEqual(
    silence.metrics().map(x=>({
      frames:x.frameCount,
      silent:x.silentFrameCount,
      max:x.consecutiveSilentFramesMax,
      gap:x.providerSilenceGapMaxMs,
    })),
    [{frames:3,silent:2,max:2,gap:40}],
  );
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
  const tokenLimited:any=normalizeOpenAIRealtimeEvent({
    type:"response.done",
    response:{
      id:"response-safe",
      status:"incomplete",
      status_details:{type:"incomplete",reason:"max_output_tokens"},
      max_output_tokens:28,
      output:[{content:[{type:"audio",transcript:"Да, вас"}]}],
    },
  },providerFrame);
  assert.equal(tokenLimited.type,"response_completed");
  assert.equal(tokenLimited.providerStatus,"incomplete");
  assert.equal(tokenLimited.finishReason,"max_output_tokens");
  assert.equal(tokenLimited.maxOutputTokens,28);
  assert.equal(tokenLimited.outputTranscript,"Да, вас");
  assert.equal(assessSemanticCompletion(tokenLimited.outputTranscript).complete,false);
  const safeUsage=projectSafeVoiceUsage({total_tokens:30,input_tokens:20,output_tokens:10,input_token_details:{audio_tokens:12,cached_tokens:3},output_token_details:{audio_tokens:8},api_key:"must-not-project"},{inputSeconds:61,outputSeconds:22});
  assert.equal(safeUsage.total_tokens,30);assert.equal(safeUsage.audio_tokens,20);assert.equal(safeUsage.cached_tokens,3);assert.equal((safeUsage as any).api_key,undefined);assert.equal(safeUsage.estimated_cost,null);
  const priced=estimateVoiceCost(safeUsage,{version:"2026-07-test",currency:"USD",rates:{audio:.001}});
  assert.equal(priced.estimated_cost,.02);assert.equal(priced.pricing_snapshot_version,"2026-07-test");
  assert.equal(estimateVoiceCost(safeUsage,null).estimated_cost,null);
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
      {type:"input_audio_buffer.speech_stopped",item_id:"item-user"},
      providerFrame,
    ),
    {type:"input_audio_stopped",itemId:"item-user"},
  );
  assert.equal(
    normalizeOpenAIRealtimeEvent(
      {type:"response.created",response:{id:"resp-current"}},
      providerFrame,
    )?.responseId,
    "resp-current",
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
  assert.match(instructions.instructions, /одним законченным/);
  assert.match(instructions.instructions, /6–14 слов/);
  assert.match(instructions.instructions, /не обрывай/);
  assert.match(instructions.instructions, /замолчи и слушай/);
  assert.match(instructions.instructions,/реальный сервис записи/);
  assert.match(instructions.instructions,/выполняй молча/iu);
  assert.doesNotMatch(instructions.instructions,/пока безопасный backend/iu);
  assert.equal(containsInternalAgentDisclosure("У меня нет доступа к безопасному backend"),true);
  assert.equal(containsInternalAgentDisclosure("Мы разрабатываем публичный API для клиентов"),false);
  assert.equal(containsInternalAgentDisclosure("У нас есть API для интеграции клиентов"),false);
  assert.equal(isUnexpectedEnglishVoiceResponse("Hi! I can hear you. What would you like help with today?"),true);
  assert.equal(isUnexpectedEnglishVoiceResponse("Подключение к API компании работает штатно"),false);
  assert.equal(isUnexpectedEnglishVoiceResponse("Перейдите на English, пожалуйста"),false);
  assert.match(customerSafeToolResult(false),/соединить вас с сотрудником/iu);
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
    ),
    openaiAdapter=fs.readFileSync(
      "server/ai-platform/voice/providers/adapters/openaiRealtimeAdapter.ts",
      "utf8",
    ),
    transcriptService=fs.readFileSync("server/ai-platform/voice/transcripts/voiceTranscriptService.ts","utf8"), transcriptRouter=fs.readFileSync("server/ai-platform/voice/transcripts/api/voiceTranscriptRouter.ts","utf8");
  assert.match(router, /Raw audio payload is forbidden/);
  assert.doesNotMatch(router, /apiKey|Authorization|providerSessionIdHash/);
  assert.match(migration, /ai\.realtime_voice_enabled','false/);
  assert.match(migration, /ai\.realtime_voice_provider','synthetic/);
  assert.match(service, /transferRequired\s*=\s*true/);
  assert.match(service, /toolCalls\s*>\s*2/);
  assert.match(service, /greetingStatus\s*!==\s*["']not_started["']/);
  assert.match(service,/event\.kind===["']input_partial["']/);
  assert.match(service,/createResponseForRemainder/);
  assert.match(openaiAdapter,/max_output_tokens/);
  assert.doesNotMatch(openaiAdapter,/max_response_output_tokens/);
  assert.match(openaiAdapter,/GENERAL_MAX_OUTPUT_TOKENS\s*=\s*4096/);
  assert.doesNotMatch(openaiAdapter,/max_output_tokens:\s*[^,\n]*["']inf["']/);
  assert.match(openaiAdapter,/greetingOutputTokens\s*\|\|\s*160/);
  assert.match(service,/retryPendingFromResponseId/);
  assert.match(service,/supersedeForRetry/);
  assert.match(transcriptService,/provider_finish_reason/);
  assert.match(transcriptService,/provider_truncated/);
  assert.doesNotMatch(
    service,
    /asterisk\s+-rx|external_host|createBridge|answerChannel/i,
  );
  assert.match(transcriptService,/spoken_text_safe/);
  assert.match(transcriptService,/provider_item_ref/);
  assert.match(transcriptService,/current_partial_text_safe=CONCAT/);
  assert.match(transcriptService,/logical_key/);
  assert.match(transcriptService,/provider_audio_transcript_safe/);
  assert.match(transcriptService,/transcript_accuracy/);
  assert.match(migration,/ai\.voice_max_single_response_audio_seconds/);
  assert.match(migration,/uniq_ai_voice_logical_utterance/);
  assert.match(migration,/20260723_042_voice_response_completion/);
  assert.match(migration,/20260723_044_agent_personality_profile/);
  assert.match(migration,/provider_finish_reason/);
  assert.match(migration,/output_token_limit_hit/);
  assert.match(transcriptService,/COALESCE\(last_delta_at,started_at\)/);
  assert.match(service,/speechEndToFirstAudioMs/);
  assert.match(transcriptService,/incomplete=1/);
  assert.match(transcriptService,/redactAiPlatformText/);
  assert.doesNotMatch(transcriptService+transcriptRouter,/input_audio_buffer|base64|Authorization|OPENAI_API_KEY|raw PCM/i);
  assert.match(transcriptRouter,/text\/event-stream/);
  assert.match(transcriptRouter,/export_ai_voice_transcripts/);
  assert.match(transcriptRouter,/voice_live_delivery_summary/);
  assert.match(transcriptRouter,/recording_stream_url/);
  console.log("AI Platform realtime voice tests passed");
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
