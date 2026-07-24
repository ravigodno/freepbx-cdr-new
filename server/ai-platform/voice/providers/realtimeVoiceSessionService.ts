import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import {
  redactAiPlatformText,
  redactAiPlatformValue,
  type RedactionStats,
} from "../../core/redaction.js";
import { AgentContextBuilder } from "../../core/agentContextBuilder.js";
import { SkillRepository } from "../../skills/skillRepository.js";
import {
  validateConfiguredSkillSet,
  type SkillSchema,
} from "../../skills/skillSchema.js";
import type { ToolExecutor } from "../../tools/toolExecutor.js";
import type { HumanTransferService } from "../../transfer/humanTransferService.js";
import type { BusinessActionService } from "../../actions/businessActionService.js";
import {
  SkillRouter,
  type SkillRoutingDecision,
  type StructuredSkillClassifier,
} from "../../skills/skillRouter.js";
import type { AudioFrame } from "../media/mediaTypes.js";
import type { MediaSessionService } from "../media/mediaSessionService.js";
import { RealtimeVoiceProviderRegistry } from "./realtimeVoiceProviderRegistry.js";
import { RealtimeVoiceSessionRepository } from "./realtimeVoiceSessionRepository.js";
import { RealtimeVoiceError } from "./realtimeVoiceErrors.js";
import type {
  RealtimeVoiceConfig,
  RealtimeVoiceEvent,
  RealtimeVoiceSessionProjection,
  RealtimeVoiceState,
} from "./realtimeVoiceTypes.js";
import {
  callbackIntent,
  composeRealtimeInstructions,
  detectRealtimeTransfer,
} from "./realtimeVoicePolicy.js";
import { readOpenAIRealtimeConfig } from "./adapters/openaiRealtimeAdapter.js";
import { MetricsFlusher } from "../media/metricsFlusher.js";
import type { VoiceTranscriptService } from "../transcripts/voiceTranscriptService.js";
import { readVoiceDurationPolicy } from "../media/voiceDurationPolicy.js";
import { containsInternalAgentDisclosure, customerSafeToolResult, isUnexpectedEnglishVoiceResponse } from "./voiceOutputGuard.js";
import {
  classifyCallerSpeech,
  extractStopCommand,
  VoiceTurnCoordinator,
  type InterruptionDecision,
} from "./voiceTurnCoordinator.js";
import {
  receptionistResponseBudgets,
  type ReceptionistResponseBudgets,
} from "./realtimeResponseCompletion.js";
import {
  createResponseStreamState,
  delayedStreamingPolicy,
  mayRetryBeforePlayout,
  pushResponseFrame,
  releaseResponseTail,
  releaseAfterPlayoutStarted,
  sentenceBoundaryAfterWarning,
  type ResponseStreamState,
} from "./delayedResponseStream.js";
import {
  createGenericTaskState,
  applySkillRoutingDecision,
  isFarewellIntent,
  planGenericResponse,
  markGenericActionResultReported,
  updateGenericTaskState,
  type GenericConversationTaskState,
  type GenericResponsePlan,
} from "./genericConversationTaskState.js";
import {
  routeConfiguredConversationIntent,
  configuredMetaResponseForTurn,
  rowsToConfiguredConversationIntents,
  type ConfiguredConversationIntentRoute,
} from "./configuredConversationIntentRouter.js";
import {
  ClosingCoordinator,
  type SafeHangupResult,
} from "./closingCoordinator.js";
import{HumanHandoffCoordinator}from"../../handoff/humanHandoffCoordinator.js";

const transitions: Record<RealtimeVoiceState, RealtimeVoiceState[]> = {
  created: ["connecting", "failed", "cancelled"],
  connecting: ["connected", "failed", "cancelled"],
  connected: ["configured", "failed", "cancelled"],
  configured: ["listening", "failed", "cancelled"],
  listening: ["responding", "closing", "failed", "cancelled"],
  responding: ["interrupted", "listening", "closing", "failed", "cancelled"],
  interrupted: ["listening", "closing", "failed", "cancelled"],
  closing: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
type Runtime = {
  tenantId: number;
  voiceSessionId: number;
  mediaSessionId: number;
  routeBindingId: number | null;
  agentId: number;
  agentVersionId: number;
  adapter: any;
  flusher: MetricsFlusher;
  unsubscribeProvider: () => void;
  unsubscribeMedia: () => void;
  unsubscribeVad: () => void;
  unsubscribePlayout: () => void;
  unsubscribePlayoutLifecycle: () => void;
  aborter: AbortController;
  started: number;
  inputFrames: number;
  outputFrames: number;
  inputAudioMs: number;
  outputAudioMs: number;
  firstInputAt: number | null;
  firstOutputAt: number | null;
  commitAt: number | null;
  speechEndAt: number | null;
  startedMonotonic: number;
  commitMonotonic: number | null;
  speechEndMonotonic: number | null;
  firstOutputMonotonic: number | null;
  firstResponseLatencyMs: number | null;
  speechEndToFirstAudioMs: number | null;
  commitToFirstAudioMs: number | null;
  sessionStartToFirstAudioMs: number | null;
  maxCallDurationMs: number;
  interruptions: number;
  toolCalls: number;
  transcripts: Array<{ kind: any; text: string }>;
  canonicalInputFinalKeys: Set<string>;
  transferRequired: boolean;
  callbackOfferRequired: boolean;
  blocked: boolean;
  responsePending: boolean;
  turnState: "listening"|"responding"|"cancelling"|"interrupted"|"listening_after_interrupt";
  activeResponseId: string | null;
  activeItemId: string | null;
  cancelledResponseIds: Set<string>;
  providerDoneResponseIds: Set<string>;
  responsePlayedMs: number;
  bargeInDetectedAt: number | null;
  cancelSentAt: number | null;
  playoutStoppedAt: number | null;
  cancelLatencyMs: number | null;
  audibleStopLatencyMs: number | null;
  discardedBufferedAudioMs: number;
  falseBargeInCount: number;
  staleDeltaIgnored: number;
  duplicateCancelIgnored: number;
  truncateSentCount: number;
  responseLimitCancelCount: number;
  providerFirstDeltaMonotonic: number | null;
  queuedAudioAtFirstPlayoutMs: number | null;
  currentTurnFirstOutputMonotonic: number | null;
  turnLatencies: Array<Record<string, number | string | null>>;
  languageCorrectedResponses: Set<string>;
  speechAnchorSource: "provider_vad"|"local_vad"|null;
  commitAnchorSource: "provider_commit"|"client_commit"|null;
  actorId: string;
  greetingStatus: "not_started" | "started" | "completed" | "interrupted";
  greetingStartedAt: number | null;
  greetingCompletedAt: number | null;
  coordinator: VoiceTurnCoordinator;
  interruptionTimer: NodeJS.Timeout | null;
  pendingCallerCommit: boolean;
  responseGeneratedMs: number;
  maxResponseAudioMs: number;
  callerPartialText: string;
  canonicalInterruptionKeys: Set<string>;
  pendingStopRemainder: string | null;
  pendingStopDetectedAt: number | null;
  keywordToAudibleStopMs: number | null;
  deferredResponse: { itemId?:string; text:string } | null;
  controlledLimitResponseIds: Set<string>;
  receptionist: boolean;
  responseBudgets: ReceptionistResponseBudgets;
  responseStreams: Map<string, ResponseStreamState>;
  streamingPolicy: ReturnType<typeof delayedStreamingPolicy>;
  sentenceStoppedResponseIds: Set<string>;
  responseTranscripts: Map<string, string>;
  responseRetryCounts: Map<string, number>;
  retryPendingFromResponseId: string | null;
  fallbackResponseIds:Set<string>;
  fallbackPending:boolean;
  tokenLimitHitCount: number;
  semanticIncompleteCount: number;
  taskState: GenericConversationTaskState;
  skills: SkillSchema[];
  conversationIntentRoutes:ConfiguredConversationIntentRoute[];
  pendingConversationIntentPlan:GenericResponsePlan|null;
  actionResultReported:boolean;
  lastConversationIntent:{intentKey:string;matchedTrigger:string;routeMode:string}|null;
  skillRoutingDecision: SkillRoutingDecision | null;
  redactionCounts: RedactionStats;
  plannerDecision: {
    intent: string;
    selectedAction: string | null;
    templateKey: string | null;
  } | null;
  endOfTurnSilenceMs:number;
  currentPipeline:{
    actualSpeechEndEstimatedAt:number|null;
    vadStopAt:number|null;
    inputFinalAt:number|null;
    routingStartedAt:number|null;
    routingDoneAt:number|null;
    extractionStartedAt:number|null;
    extractionDoneAt:number|null;
    plannerStartedAt:number|null;
    plannerDoneAt:number|null;
    responseCreateAt:number|null;
    responseCreateDoneAt:number|null;
    providerFirstDeltaAt:number|null;
    startupBufferReadyAt:number|null;
    audibleStartAt:number|null;
    deterministicFastPath:boolean;
    classifierSkipped:boolean;
    llmExtractionSkipped:boolean;
  }|null;
  closing: ClosingCoordinator;
  handoff:HumanHandoffCoordinator;
  handoffConfig:any|null;
  commitDispatchMs: number | null;
  responseCreateDispatchMs: number | null;
};

export class RealtimeVoiceSessionService {
  private repo: RealtimeVoiceSessionRepository;
  private runtimes = new Map<number, Runtime>();
  private liveObserver:
    | ((event: {
        tenantId: number;
        voiceSessionId: number;
        type: "first_audio" | "barge_in" | "transfer";
        latencyMs: number | null;
        traceId: string;
      }) => Promise<void>)
    | null = null;
  private controlledHangup:
    | ((event:{tenantId:number;voiceSessionId:number;traceId:string})=>Promise<SafeHangupResult>)
    | null = null;
  private handoffConfigResolver:((input:{tenantId:number;agentId:number;agentVersionId:number})=>Promise<any|null>)|null=null;
  private controlledHandoff:((input:{tenantId:number;voiceSessionId:number;traceId:string;config:any;coordinator:HumanHandoffCoordinator})=>Promise<void>)|null=null;
  private skillRouter = new SkillRouter();
  constructor(
    private store: AiPlatformStore,
    private audit: AiAuditService,
    private registry: RealtimeVoiceProviderRegistry,
    private media: MediaSessionService,
    private isEnabled: () => Promise<boolean>,
    private toolExecutor: ToolExecutor | null = null,
    private humanTransfer: HumanTransferService | null = null,
    private businessActions: BusinessActionService | null = null,
    private transcriptService: VoiceTranscriptService | null = null,
  ) {
    this.repo = new RealtimeVoiceSessionRepository(store);
    void businessActions;
  }
  setControlledHangupHandler(handler:(event:{tenantId:number;voiceSessionId:number;traceId:string})=>Promise<SafeHangupResult>){
    this.controlledHangup=handler;
  }
  setHandoffHandlers(config:(input:{tenantId:number;agentId:number;agentVersionId:number})=>Promise<any|null>,execute:(input:{tenantId:number;voiceSessionId:number;traceId:string;config:any;coordinator:HumanHandoffCoordinator})=>Promise<void>){this.handoffConfigResolver=config;this.controlledHandoff=execute}
  setSkillClassifier(classifier:StructuredSkillClassifier|null){
    this.skillRouter.setClassifier(classifier);
  }
  private async row(tenantId: number, id: number) {
    const rows = await this.repo.get(tenantId, id);
    if (!rows[0])
      throw new RealtimeVoiceError(
        "not_found",
        404,
        "Realtime voice session not found",
      );
    return rows[0];
  }
  private project(row: any, runtime?: Runtime): RealtimeVoiceSessionProjection {
    let metadata: any = {};
    try {
      metadata = JSON.parse(String(row.metadata_json || "{}"));
    } catch {}
    const greetingStatus =
        runtime?.greetingStatus || metadata.greetingStatus || "not_started",
      greetingStartedAt =
        runtime?.greetingStartedAt || metadata.greetingStartedAt || null,
      greetingCompletedAt =
        runtime?.greetingCompletedAt || metadata.greetingCompletedAt || null;
    return {
      id: Number(row.id),
      tenantId: Number(row.tenant_id),
      voiceSessionId: Number(row.voice_session_id),
      mediaSessionId: Number(row.media_session_id),
      providerKey: row.provider_key,
      state: row.state,
      inputCodec: row.input_codec,
      outputCodec: row.output_codec,
      inputSampleRate: Number(row.input_sample_rate),
      outputSampleRate: Number(row.output_sample_rate),
      language: row.language,
      voiceKeySafe: row.voice_key_safe || null,
      serverVadEnabled: Boolean(row.server_vad_enabled),
      toolsEnabled: Boolean(row.tools_enabled),
      connectedAt: row.connected_at || null,
      firstInputAudioAt: row.first_input_audio_at || null,
      firstOutputAudioAt: row.first_output_audio_at || null,
      endedAt: row.ended_at || null,
      inputFrames: Number(row.input_frames),
      outputFrames: Number(row.output_frames),
      inputAudioMs: Number(row.input_audio_ms),
      outputAudioMs: Number(row.output_audio_ms),
      firstResponseLatencyMs:
        row.first_response_latency_ms === null
          ? null
          : Number(row.first_response_latency_ms),
      speechEndToFirstAudioMs: row.speech_end_to_first_audio_ms === null ? null : Number(row.speech_end_to_first_audio_ms),
      commitToFirstAudioMs: row.commit_to_first_audio_ms === null ? null : Number(row.commit_to_first_audio_ms),
      sessionStartToFirstAudioMs: row.session_start_to_first_audio_ms === null ? null : Number(row.session_start_to_first_audio_ms),
      interruptionCount: Number(row.interruption_count),
      toolCallCount: Number(row.tool_call_count),
      failureCode: row.failure_code || null,
      transcripts: runtime?.transcripts || metadata.transcripts || [],
      transferRequired:
        runtime?.transferRequired || Boolean(metadata.transferRequired),
      callbackOfferRequired:
        runtime?.callbackOfferRequired ||
        Boolean(metadata.callbackOfferRequired),
      queueDepth: 0,
      greetingStatus,
      greetingStartedAt: greetingStartedAt
        ? new Date(greetingStartedAt).toISOString()
        : null,
      greetingCompletedAt: greetingCompletedAt
        ? new Date(greetingCompletedAt).toISOString()
        : null,
      greetingInterrupted: greetingStatus === "interrupted",
    };
  }
  async get(tenantId: number, id: number) {
    return this.project(await this.row(tenantId, id), this.runtimes.get(id));
  }
  async list(tenantId: number, limit: number, offset: number) {
    return (await this.repo.list(tenantId, limit, offset)).map((row) =>
      this.project(row, this.runtimes.get(Number(row.id))),
    );
  }
  private async transition(
    tenantId: number,
    id: number,
    to: RealtimeVoiceState,
    traceId: string,
    failureCode: string | null = null,
  ) {
    const row = await this.row(tenantId, id);
    if (row.state === to) return;
    if (!transitions[row.state as RealtimeVoiceState]?.includes(to))
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Invalid realtime voice transition",
      );
    const result: any = await this.repo.transition(
      tenantId,
      id,
      row.state,
      to,
      failureCode,
    );
    if (!result.affectedRows)
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Concurrent realtime voice transition",
      );
    const event =
      to === "connecting"
        ? "realtime_provider_connecting"
        : to === "connected"
          ? "realtime_provider_connected"
          : to === "configured"
            ? "realtime_provider_configured"
            : to === "responding"
              ? "realtime_response_started"
              : to === "completed"
                ? "realtime_voice_session_completed"
                : to === "failed"
                  ? "realtime_provider_failed"
                  : to === "interrupted"
                    ? "realtime_barge_in"
                    : "realtime_input_started";
    await this.audit.append({
      tenantId,
      traceId,
      actorType: "service",
      eventType: event as any,
      entityType: "realtime_voice_session",
      entityId: String(id),
      decision: to,
      details: { failureCode },
    });
  }
  async start(input: {
    tenantId: number;
    mediaSessionId: number;
    providerKey: string;
    traceId: string;
    actorId: string;
    restoreTaskState?: boolean;
  }) {
    if (!(await this.isEnabled()))
      throw new RealtimeVoiceError(
        "feature_disabled",
        503,
        "Realtime voice is disabled",
      );
    const same = [...this.runtimes.values()].filter(
      (runtime) => runtime.adapter.getKey() === "synthetic",
    ).length;
    if (input.providerKey === "synthetic" && same >= 2)
      throw new RealtimeVoiceError(
        "concurrency_limited",
        429,
        "Synthetic realtime session limit reached",
      );
    if (
      input.providerKey !== "synthetic" &&
      [...this.runtimes.values()].some(
        (runtime) => runtime.adapter.getKey() !== "synthetic",
      )
    )
      throw new RealtimeVoiceError(
        "concurrency_limited",
        429,
        "External realtime session limit reached",
      );
    const source = (
      await this.store.query(
        `SELECT m.id media_id,m.voice_session_id,m.transport_mode,m.state media_state,v.route_binding_id,v.agent_id,v.agent_version_id,v.conversation_id,v.language,v.state voice_state,av.lifecycle_status FROM ai_voice_media_sessions m JOIN ai_voice_sessions v ON v.id=m.voice_session_id AND v.tenant_id=m.tenant_id JOIN ai_agent_versions av ON av.id=v.agent_version_id AND av.tenant_id=v.tenant_id WHERE m.id=? AND m.tenant_id=? LIMIT 1`,
        [input.mediaSessionId, input.tenantId],
      )
    )[0];
    if (!source)
      throw new RealtimeVoiceError("not_found", 404, "Media session not found");
    if (
      !["synthetic", "audiosocket"].includes(source.transport_mode) ||
      source.media_state !== "streaming" ||
      source.voice_state !== "active"
    )
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Active supported media is required",
      );
    if (source.lifecycle_status !== "published")
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Published agent version is required",
      );
    if ((await this.repo.findActive(input.tenantId, input.mediaSessionId))[0])
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Active realtime session already exists",
      );
    const context: any = await new AgentContextBuilder(this.store).buildContext(
        input.tenantId,
        Number(source.agent_version_id),
      ),
      skills = await new SkillRepository(this.store).forAgentVersion(
        input.tenantId,
        Number(source.agent_version_id),
      ),
      conversationIntentRows=await this.store.query(
        `SELECT intent_key,trigger_phrases_json,negative_trigger_phrases_json,response_template,route_mode,priority
         FROM ai_conversation_intent_routes
         WHERE (tenant_id=? OR tenant_id IS NULL) AND active=1
         ORDER BY priority DESC,id`,
        [input.tenantId],
      ),
      conversationIntentRoutes=rowsToConfiguredConversationIntents(conversationIntentRows),
      handoffConfig=await this.handoffConfigResolver?.({
        tenantId:input.tenantId,
        agentId:Number(source.agent_id),
        agentVersionId:Number(source.agent_version_id),
      })||null,
      skillErrors = validateConfiguredSkillSet(
        skills,
        (context?.agent?.version?.config || {}) as Record<string, unknown>,
      ),
      instructions = composeRealtimeInstructions(
        context,
        String(source.language || "ru"),
      ),
      adapter = this.registry.create(input.providerKey),
      capabilities = adapter.getCapabilities(),
      nativeTelephoneAudio =
        input.providerKey === "openai_realtime" &&
        source.transport_mode === "audiosocket",
      inputFormat = {
        codec: "slin16" as const,
        sampleRate: nativeTelephoneAudio ? 8000 : 16000,
        channels: 1 as const,
        frameDurationMs: 20,
      },
      outputFormat = {
        codec: nativeTelephoneAudio ? ("ulaw" as const) : ("slin16" as const),
        sampleRate: nativeTelephoneAudio ? 8000 : 16000,
        channels: 1 as const,
        frameDurationMs: 20,
      };
    if (skillErrors.length)
      throw new RealtimeVoiceError(
        "invalid_request",
        409,
        `Configured skill validation failed: ${skillErrors.join(",")}`,
      );
    if (
      !capabilities.supportedInputFormats.some(
        (item) =>
          item.codec === inputFormat.codec &&
          item.sampleRate === inputFormat.sampleRate,
      )
    )
      throw new RealtimeVoiceError(
        "unsupported_codec",
        400,
        "Provider codec is incompatible",
      );
    const assigned = await this.store.query(
        `SELECT t.tool_key,t.description,t.input_schema_json FROM ai_agent_tools at JOIN ai_tools t ON t.id=at.tool_id WHERE at.tenant_id=? AND at.agent_version_id=? AND at.enabled=1 AND t.enabled=1 AND t.risk_level='read'`,
        [input.tenantId, source.agent_version_id],
      ),
      external = readOpenAIRealtimeConfig();
      const receptionist=String(context?.agent?.type||"")==="receptionist",
      responseBudgets=receptionistResponseBudgets(
        context?.agent?.version?.config,
      ),
      streamingPolicy=delayedStreamingPolicy(context?.agent?.version?.config),
      config: RealtimeVoiceConfig = {
      providerKey: input.providerKey,
      apiKey:
        input.providerKey === "openai_realtime" ? external.apiKey : undefined,
      url: input.providerKey === "openai_realtime" ? external.url : undefined,
      model:
        input.providerKey === "openai_realtime"
          ? external.model
          : "synthetic-voice",
      voice: input.providerKey === "openai_realtime"
        ? String(context?.agent?.version?.config?.voiceProfile?.voiceId||"marin")
        : "natural",
      language: String(context?.agent?.version?.config?.voiceProfile?.locale||source.language||"ru"),
      instructions: instructions.instructions,
      maxOutputTokens: receptionist ? responseBudgets.response : undefined,
      retryOutputTokens: receptionist ? responseBudgets.retry : undefined,
      greetingOutputTokens: receptionist ? responseBudgets.greeting : undefined,
      inputFormat,
      outputFormat,
      serverVad:
        input.providerKey === "openai_realtime"
          ? false
          : capabilities.serverVad,
      semanticVad: false,
      responseEagerness: String(context?.agent?.version?.config?.voice?.responseEagerness||"high") as any,
      endOfTurnSilenceMs: Number(context?.agent?.version?.config?.voice?.endOfTurnSilenceMs||450),
      tools: capabilities.tools
        ? assigned.map((tool: any) => ({
            key: tool.tool_key,
            description: tool.description,
            inputSchema: JSON.parse(tool.input_schema_json || "{}"),
          }))
        : [],
      timeoutMs: 5000,
    };
    if (!(await adapter.validateConfig(config)).valid)
      throw new RealtimeVoiceError(
        "provider_not_configured",
        503,
        "Realtime provider is not configured",
      );
    const id = await this.repo.create({
      tenantId: input.tenantId,
      voiceSessionId: Number(source.voice_session_id),
      mediaSessionId: input.mediaSessionId,
      providerKey: input.providerKey,
      language: config.language,
      voice: config.voice || null,
      serverVad: config.serverVad,
      tools: config.tools.length > 0,
      input: inputFormat,
      output: outputFormat,
      metadata: {
        instructionChecksum: instructions.checksum,
        agentVersionId: source.agent_version_id,
        transcripts: [],
      },
    });
    await this.audit.append({
      tenantId: input.tenantId,
      traceId: input.traceId,
      actorType: "user",
      actorId: input.actorId,
      eventType: "realtime_voice_session_created",
      entityType: "realtime_voice_session",
      entityId: String(id),
      decision: "created",
      details: {
        providerKey: input.providerKey,
        instructionChecksum: instructions.checksum,
      },
    });
    const durationPolicy = await readVoiceDurationPolicy(this.store),
      aborter = new AbortController(),
      restoredTaskState=input.restoreTaskState
        ? await this.restoreTaskState(input.tenantId,Number(source.voice_session_id))
        : null,
      runtime: Runtime = {
        tenantId: input.tenantId,
        voiceSessionId: Number(source.voice_session_id),
        mediaSessionId: input.mediaSessionId,
        routeBindingId:source.route_binding_id?Number(source.route_binding_id):null,
        agentId:Number(source.agent_id),
        agentVersionId:Number(source.agent_version_id),
        adapter,
        flusher: null as any,
        unsubscribeProvider: () => {},
        unsubscribeMedia: () => {},
        unsubscribeVad: () => {},
        unsubscribePlayout: () => {},
        unsubscribePlayoutLifecycle: () => {},
        aborter,
        started: Date.now(),
        inputFrames: 0,
        outputFrames: 0,
        inputAudioMs: 0,
        outputAudioMs: 0,
        firstInputAt: null,
        firstOutputAt: null,
        commitAt: null,
        speechEndAt: null,
        startedMonotonic: performance.now(),
        commitMonotonic: null,
        speechEndMonotonic: null,
        firstOutputMonotonic: null,
        firstResponseLatencyMs: null,
        speechEndToFirstAudioMs: null,
        commitToFirstAudioMs: null,
        sessionStartToFirstAudioMs: null,
        maxCallDurationMs: durationPolicy.maxCallDurationSeconds * 1000,
        interruptions: 0,
        toolCalls: 0,
        transcripts: [],
        canonicalInputFinalKeys: new Set(),
        transferRequired: false,
        callbackOfferRequired: false,
        blocked: false,
        responsePending: false,
        turnState: "listening",
        activeResponseId: null,
        activeItemId: null,
        cancelledResponseIds: new Set(),
        providerDoneResponseIds: new Set(),
        responsePlayedMs: 0,
        bargeInDetectedAt: null,
        cancelSentAt: null,
        playoutStoppedAt: null,
        cancelLatencyMs: null,
        audibleStopLatencyMs: null,
        discardedBufferedAudioMs: 0,
        falseBargeInCount: 0,
        staleDeltaIgnored: 0,
        duplicateCancelIgnored: 0,
        truncateSentCount: 0,
        responseLimitCancelCount: 0,
        providerFirstDeltaMonotonic: null,
        queuedAudioAtFirstPlayoutMs: null,
        currentTurnFirstOutputMonotonic: null,
        turnLatencies: [],
        languageCorrectedResponses: new Set(),
        speechAnchorSource: null,
        commitAnchorSource: null,
        actorId: input.actorId,
        greetingStatus: "not_started",
        greetingStartedAt: null,
        greetingCompletedAt: null,
        coordinator:new VoiceTurnCoordinator({sessionRef:String(id)}),
        interruptionTimer:null,
        pendingCallerCommit:false,
        responseGeneratedMs:0,
        maxResponseAudioMs:receptionist?streamingPolicy.hardMs:60000,
        callerPartialText:"",
        canonicalInterruptionKeys:new Set(),
        pendingStopRemainder:null,
        pendingStopDetectedAt:null,
        keywordToAudibleStopMs:null,
        deferredResponse:null,
        controlledLimitResponseIds:new Set(),
        receptionist,
        responseBudgets,
        responseStreams:new Map(),
        streamingPolicy,
        sentenceStoppedResponseIds:new Set(),
        responseTranscripts:new Map(),
        responseRetryCounts:new Map(),
        retryPendingFromResponseId:null,
        fallbackResponseIds:new Set(),
        fallbackPending:false,
        tokenLimitHitCount:0,
        semanticIncompleteCount:0,
        taskState:restoredTaskState||createGenericTaskState(),
        skills,
        conversationIntentRoutes,
        pendingConversationIntentPlan:null,
        actionResultReported:false,
        lastConversationIntent:null,
        skillRoutingDecision:null,
        redactionCounts:{secrets:0,emails:0,ips:0,phones:0,paths:0,truncated:0},
        plannerDecision:null,
        endOfTurnSilenceMs:config.endOfTurnSilenceMs||450,
        currentPipeline:null,
        closing:new ClosingCoordinator(`${input.tenantId}:${source.voice_session_id}`),
        handoff:new HumanHandoffCoordinator(`${input.tenantId}:${source.voice_session_id}`),
        handoffConfig,
        commitDispatchMs:null,
        responseCreateDispatchMs:null,
      };
    runtime.flusher = new MetricsFlusher(() => this.persist(id), 1000);
    runtime.unsubscribeProvider = adapter.subscribeEvents((event) =>
      this.handleEvent(id, input.traceId, event),
    );
    this.runtimes.set(id, runtime);
    try {
      await this.transition(input.tenantId, id, "connecting", input.traceId);
      await adapter.connect(config, aborter.signal);
      await this.transition(input.tenantId, id, "connected", input.traceId);
      await adapter.configureSession(config);
      await this.transition(input.tenantId, id, "configured", input.traceId);
      this.media.configureVad(
        input.tenantId,
        input.mediaSessionId,
        config.endOfTurnSilenceMs || 450,
      );
      runtime.unsubscribeMedia = this.media.subscribeIngress(
        input.tenantId,
        input.mediaSessionId,
        (frame) => this.input(id, input.traceId, frame),
      );
      runtime.unsubscribeVad = this.media.subscribeVad(
        input.tenantId,
        input.mediaSessionId,
        (event) => {
          if (event.type === "speech_ended") {
            runtime.speechEndAt = Date.now();
            runtime.speechEndMonotonic = performance.now();
            runtime.speechAnchorSource = "local_vad";
            runtime.currentPipeline={
              actualSpeechEndEstimatedAt:runtime.speechEndMonotonic-runtime.endOfTurnSilenceMs,
              vadStopAt:runtime.speechEndMonotonic,inputFinalAt:null,
              routingStartedAt:null,routingDoneAt:null,
              extractionStartedAt:null,extractionDoneAt:null,
              plannerStartedAt:null,plannerDoneAt:null,
              responseCreateAt:null,responseCreateDoneAt:null,
              providerFirstDeltaAt:null,startupBufferReadyAt:null,audibleStartAt:null,
              deterministicFastPath:false,classifierSkipped:false,llmExtractionSkipped:true,
            };
            this.transcriptService?.turnDiagnostics(
              runtime.voiceSessionId,
              runtime.coordinator.snapshot(),
            );
            return this.commit(input.tenantId, id, input.traceId).then(() => {});
          }
          runtime.coordinator.beginCallerTurn();
          runtime.callerPartialText="";
          runtime.pendingStopRemainder=null;
          runtime.pendingStopDetectedAt=null;
          runtime.coordinator.updateQueuedAudio(
            this.media.getProtocolMetrics(
              input.tenantId,
              input.mediaSessionId,
            )?.queuedAudioMsCurrent || 0,
          );
          const decision=runtime.coordinator.callerSpeechStarted({
            energy:event.energyLevel,
            echoSuspected:event.echoSuspected,
          });
          this.transcriptService?.turnDiagnostics(
            runtime.voiceSessionId,
            runtime.coordinator.snapshot(),
          );
          runtime.flusher.markDirty();
        },
      );
      runtime.unsubscribePlayout = this.media.subscribePlayout(
        input.tenantId,
        input.mediaSessionId,
        (frame) => this.onPlayout(id, frame),
      );
      runtime.unsubscribePlayoutLifecycle = this.media.subscribePlayoutLifecycle(
        input.tenantId,
        input.mediaSessionId,
        (event) => { void this.onPlayoutLifecycle(id,input.traceId,event); },
      );
      await this.transition(input.tenantId, id, "listening", input.traceId);
      await this.store.query(
        "UPDATE ai_voice_sessions SET provider_state='connected' WHERE tenant_id=? AND id=?",
        [input.tenantId, source.voice_session_id],
      );
      return this.get(input.tenantId, id);
    } catch (error) {
      await this.fail(
        input.tenantId,
        id,
        input.traceId,
        error instanceof RealtimeVoiceError
          ? error.code
          : "provider_not_configured",
      );
      throw error;
    }
  }
  private async restoreTaskState(tenantId:number,voiceSessionId:number){
    const rows=await this.store.query(
      "SELECT metadata_json FROM ai_realtime_voice_sessions WHERE tenant_id=? AND voice_session_id=? ORDER BY id DESC LIMIT 1",
      [tenantId,voiceSessionId],
    );
    try{
      const value=JSON.parse(String(rows[0]?.metadata_json||"{}"))?.taskState;
      if(!value||typeof value!=="object"||typeof value.collectedFields!=="object")return null;
      return{...createGenericTaskState(),...value,collectedFields:{...value.collectedFields}};
    }catch{return null}
  }
  private async input(id: number, traceId: string, frame: AudioFrame) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.blocked) return;
    if (Date.now() - runtime.started >= runtime.maxCallDurationMs) return;
    if (Date.now() - frame.timestampMs > 5000) {
      await this.fail(runtime.tenantId, id, traceId, "event_loop_lag");
      return;
    }
    runtime.inputFrames++;
    runtime.inputAudioMs += frame.durationMs;
    runtime.firstInputAt ??= Date.now();
    await runtime.adapter.appendAudio(frame);
    runtime.flusher.markDirty();
  }
  async commit(tenantId: number, id: number, traceId: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new RealtimeVoiceError(
        "not_found",
        404,
        "Active realtime session not found",
      );
    if (runtime.blocked || runtime.responsePending)
      return this.get(tenantId, id);
    if (!["listening","listening_after_interrupt"].includes(runtime.turnState))
      return this.get(tenantId, id);
    runtime.responsePending = true;
    runtime.commitAt = Date.now();
    runtime.commitMonotonic = performance.now();
    runtime.commitAnchorSource = "client_commit";
    try {
      const dispatchStarted=performance.now();
      await runtime.adapter.commitInput();
      runtime.commitDispatchMs=Math.round(performance.now()-dispatchStarted);
      void this.audit.append({
        tenantId,
        traceId,
        actorType: "user",
        eventType: "realtime_input_committed",
        entityType: "realtime_voice_session",
        entityId: String(id),
        decision: "committed",
        details: {},
      }).catch(()=>{});
    } catch (error) {
      runtime.responsePending = false;
      throw error;
    }
    return this.get(tenantId, id);
  }
  async startInitialGreeting(
    tenantId: number,
    id: number,
    traceId: string,
    text = "Здравствуйте. Чем могу помочь?",
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new RealtimeVoiceError(
        "not_found",
        404,
        "Active realtime session not found",
      );
    if (runtime.greetingStatus !== "not_started") return this.get(tenantId, id);
    const row = await this.row(tenantId, id);
    if (
      row.state !== "listening" ||
      runtime.blocked ||
      !runtime.adapter.startInitialGreeting
    )
      throw new RealtimeVoiceError(
        "conflict",
        409,
        "Realtime provider greeting is unavailable",
      );
    runtime.greetingStatus = "started";
    runtime.greetingStartedAt = Date.now();
    runtime.responsePending = true;
    await this.media.setGreetingStatus(
      tenantId,
      Number(row.media_session_id),
      "started",
    );
    await this.persist(id);
    try {
      await runtime.adapter.startInitialGreeting(text);
      if (runtime.greetingStatus === "started") {
        runtime.greetingStatus = "completed";
        runtime.greetingCompletedAt = Date.now();
        await this.media.setGreetingStatus(
          tenantId,
          Number(row.media_session_id),
          "completed",
        );
      }
      await this.persist(id);
      return this.get(tenantId, id);
    } catch (error) {
      runtime.responsePending = false;
      runtime.greetingStatus = "interrupted";
      await this.media.setGreetingStatus(
        tenantId,
        Number(row.media_session_id),
        "interrupted",
      );
      await this.persist(id);
      throw error;
    }
  }
  async bargeIn(tenantId: number, id: number, traceId: string) {
    const runtime = this.runtimes.get(id);
    if (!runtime || runtime.tenantId !== tenantId)
      throw new RealtimeVoiceError(
        "not_found",
        404,
        "Active realtime session not found",
      );
    const decision=runtime.coordinator.forceInterruption();
    if(decision.status==="confirmed")
      await this.applyCanonicalInterruption(runtime,id,traceId,decision);
    else runtime.falseBargeInCount++;
    return this.get(tenantId,id);
  }
  private async applyCanonicalInterruption(
    runtime:Runtime,
    id:number,
    traceId:string,
    decision:InterruptionDecision,
  ){
    if(decision.status!=="confirmed"||!runtime.activeResponseId)return;
    const idempotencyKey=decision.idempotencyKey;
    if(!idempotencyKey||runtime.canonicalInterruptionKeys.has(idempotencyKey)){
      runtime.duplicateCancelIgnored++;
      runtime.flusher.markDirty();
      return;
    }
    runtime.canonicalInterruptionKeys.add(idempotencyKey);
    const started=performance.now(),tenantId=runtime.tenantId;
    runtime.coordinator.markCancellationStarted();
    runtime.turnState = "cancelling";
    runtime.bargeInDetectedAt = Date.now();
    const responseId = runtime.activeResponseId,
      itemId = runtime.activeItemId;
    const row = await this.row(tenantId, id);
    runtime.discardedBufferedAudioMs = await this.media.clearEgress(
      tenantId,
      Number(row.media_session_id),
      responseId,
    );
    runtime.playoutStoppedAt = Date.now();
    runtime.audibleStopLatencyMs = Math.max(0,Math.round(performance.now()-started));
    if(decision.detectedAt){
      runtime.keywordToAudibleStopMs=Math.max(0,Date.now()-decision.detectedAt);
      runtime.pendingStopDetectedAt=decision.detectedAt;
    }
    if(decision.fastPath)
      runtime.pendingStopRemainder=decision.semanticRemainder||"";
    if(decision.cancelMode==="provider_and_playout"){
      await runtime.adapter.cancelResponse(responseId);
      runtime.cancelSentAt = Date.now();
      runtime.cancelLatencyMs = Math.max(0, Math.round(performance.now() - started));
    }
    runtime.responsePending = false;
    if (itemId && runtime.adapter.truncateResponse) {
      await runtime.adapter.truncateResponse(itemId, runtime.responsePlayedMs);
      runtime.truncateSentCount++;
    }
    runtime.cancelledResponseIds.add(responseId);
    runtime.turnState = "interrupted";
    runtime.interruptions++;
    this.media.recordCanonicalBargeIn(tenantId,runtime.mediaSessionId);
    await this.transcriptService?.interrupt(
      tenantId,id,runtime.voiceSessionId,responseId,
      runtime.responsePlayedMs,
    );
    this.transcriptService?.turnDiagnostics(
      runtime.voiceSessionId,
      runtime.coordinator.snapshot(),
    );
    if (runtime.greetingStatus === "started") {
      runtime.greetingStatus = "interrupted";
      await this.media.setGreetingStatus(
        tenantId,
        Number(row.media_session_id),
        "interrupted",
      );
    }
    if (row.state === "responding") {
      await this.transition(tenantId, id, "interrupted", traceId);
      await this.transition(tenantId, id, "listening", traceId);
    }
    runtime.turnState = "listening_after_interrupt";
    runtime.coordinator.markCancellationCompleted();
    await this.liveObserver?.({
      tenantId,
      voiceSessionId: Number(row.voice_session_id),
      type: "barge_in",
      latencyMs: runtime.audibleStopLatencyMs,
      traceId,
    });
    await this.audit.append({
      tenantId,
      traceId,
      actorType: "service",
      eventType: "realtime_response_cancelled",
      entityType: "realtime_voice_session",
      entityId: String(id),
      decision: "barge_in",
      details: {
        canonical:true,
        reason:decision.reason,
        category:decision.category,
        cancelMode:decision.cancelMode,
        keyword:decision.keyword,
        keywordToAudibleStopMs:runtime.keywordToAudibleStopMs,
        cancelLatencyMs: runtime.cancelLatencyMs,
        audibleStopLatencyMs: runtime.audibleStopLatencyMs,
        discardedBufferedAudioMs: runtime.discardedBufferedAudioMs,
      },
    });
    await this.persist(id);
  }
  private onPlayout(id: number, frame: AudioFrame) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    if (
      frame.responseId &&
      runtime.cancelledResponseIds.has(frame.responseId)
    ) return;
    runtime.responsePlayedMs += frame.durationMs;
    if (runtime.currentTurnFirstOutputMonotonic !== null) return;
    const firstPlayout = performance.now();
    let pipelineMetrics:Record<string,unknown>={};
    if(runtime.currentPipeline){
      runtime.currentPipeline.audibleStartAt=firstPlayout;
      const p=runtime.currentPipeline,duration=(from:number|null,to:number|null)=>
        from===null||to===null?null:Math.max(0,Math.round(to-from));
      pipelineMetrics={
        actualSpeechEndToVadStopMs:duration(p.actualSpeechEndEstimatedAt,p.vadStopAt),
        vadStopToInputFinalMs:duration(p.vadStopAt,p.inputFinalAt),
        inputFinalToRoutingDoneMs:duration(p.inputFinalAt,p.routingDoneAt),
        routingDoneToResponseCreateMs:duration(p.routingDoneAt,p.responseCreateAt),
        responseCreateToFirstDeltaMs:duration(p.responseCreateAt,p.providerFirstDeltaAt),
        firstDeltaToStartupBufferReadyMs:duration(p.providerFirstDeltaAt,p.startupBufferReadyAt),
        startupBufferReadyToAudibleMs:duration(p.startupBufferReadyAt,p.audibleStartAt),
        firstDeltaToAudibleMs:duration(p.providerFirstDeltaAt,p.audibleStartAt),
        totalSpeechEndToAudibleMs:duration(p.actualSpeechEndEstimatedAt,p.audibleStartAt),
        routingDurationMs:duration(p.routingStartedAt,p.routingDoneAt),
        extractionDurationMs:duration(p.extractionStartedAt,p.extractionDoneAt),
        plannerDurationMs:duration(p.plannerStartedAt,p.plannerDoneAt),
        deterministicFastPath:p.deterministicFastPath,
        classifierSkipped:p.classifierSkipped,
        llmExtractionSkipped:p.llmExtractionSkipped,
      };
    }
    runtime.currentTurnFirstOutputMonotonic = firstPlayout;
    runtime.firstOutputMonotonic ??= firstPlayout;
    runtime.firstOutputAt ??= Date.now();
    runtime.commitToFirstAudioMs = runtime.commitMonotonic === null
      ? null : Math.max(1,Math.round(firstPlayout-runtime.commitMonotonic));
    runtime.speechEndToFirstAudioMs = runtime.speechEndMonotonic === null
      ? null : Math.max(1,Math.round(firstPlayout-runtime.speechEndMonotonic));
    runtime.sessionStartToFirstAudioMs = Math.max(
      1,
      Math.round(firstPlayout-runtime.startedMonotonic),
    );
    runtime.firstResponseLatencyMs =
      runtime.speechEndToFirstAudioMs ?? runtime.commitToFirstAudioMs;
    const mediaMetrics = this.media.getProtocolMetrics?.(
      runtime.tenantId,
      runtime.mediaSessionId,
    );
    runtime.queuedAudioAtFirstPlayoutMs =
      mediaMetrics?.queuedAudioMsCurrent ?? null;
    const stream=frame.responseId
      ? runtime.responseStreams.get(frame.responseId)
      : undefined;
    runtime.turnLatencies.push({
      turn: runtime.turnLatencies.length + 1,
      speechEndToProviderFirstDeltaMs:
        runtime.speechEndMonotonic === null ||
        runtime.providerFirstDeltaMonotonic === null
          ? null
          : Math.max(0, Math.round(runtime.providerFirstDeltaMonotonic - runtime.speechEndMonotonic)),
      providerFirstDeltaToPlayoutMs:
        runtime.providerFirstDeltaMonotonic === null
          ? null
          : Math.max(0, Math.round(firstPlayout - runtime.providerFirstDeltaMonotonic)),
      firstDeltaToBufferReadyMs:
        stream?.firstDeltaAt==null||stream.startupBufferReadyAt==null
          ? null
          : Math.max(0,Math.round(stream.startupBufferReadyAt-stream.firstDeltaAt)),
      bufferReadyToAudibleMs:
        stream?.startupBufferReadyAt==null
          ? null
          : Math.max(0,Math.round(firstPlayout-stream.startupBufferReadyAt)),
      speechEndToPlayoutMs: runtime.speechEndToFirstAudioMs,
      speechEndToAudibleMs:runtime.speechEndToFirstAudioMs,
      commitToPlayoutMs: runtime.commitToFirstAudioMs,
      providerDoneMinusAudibleStartMs:
        stream?.providerDoneAt==null
          ? null
          : Math.round(stream.providerDoneAt-firstPlayout),
      totalResponseGenerationMs:
        stream?.providerDoneAt==null||stream.firstDeltaAt==null
          ? null
          : Math.max(0,Math.round(stream.providerDoneAt-stream.firstDeltaAt)),
      queuedAudioAtFirstPlayoutMs: runtime.queuedAudioAtFirstPlayoutMs,
      speechAnchorSource: runtime.speechAnchorSource,
      commitAnchorSource: runtime.commitAnchorSource,
      ...pipelineMetrics,
    });
    runtime.currentPipeline=null;
    if (runtime.turnLatencies.length > 50) runtime.turnLatencies.shift();
    runtime.flusher.markDirty();
  }
  private async enqueueResponseFrames(
    runtime:Runtime,
    realtimeSessionId:number,
    responseId:string,
    traceId:string,
    frames:AudioFrame[],
  ){
    const outputFramesBefore=runtime.outputFrames;
    for(const frame of frames){
      const enqueue=await this.media.enqueueEgress(
        runtime.tenantId,
        runtime.mediaSessionId,
        frame,
      );
      if(!enqueue.accepted){
        if(enqueue.reason==="response_limit"){
          runtime.controlledLimitResponseIds.add(responseId);
          runtime.responseLimitCancelCount++;
        }
        continue;
      }
      runtime.outputFrames++;
      runtime.outputAudioMs+=frame.durationMs;
    }
    const stream=runtime.responseStreams.get(responseId);
    if(stream&&frames.length){
      stream.framesSent+=frames.length;
      stream.workerFirstBatchReceivedAt??=performance.now();
    }
    runtime.coordinator.updateQueuedAudio(
      this.media.getProtocolMetrics(
        runtime.tenantId,
        runtime.mediaSessionId,
      )?.queuedAudioMsCurrent||0,
    );
    if(frames.length&&outputFramesBefore===0)
      await this.audit.append({
        tenantId:runtime.tenantId,
        traceId,
        actorType:"service",
        eventType:"realtime_first_audio",
        entityType:"realtime_voice_session",
        entityId:String(realtimeSessionId),
        decision:"output",
        details:{firstResponseLatencyMs:runtime.firstResponseLatencyMs},
      });
  }
  private async onPlayoutLifecycle(
    id:number,
    traceId:string,
    event:{type:"started"|"completed"|"interrupted";responseId?:string;playedAudioMs:number;discardedAudioMs?:number},
  ){
    const runtime=this.runtimes.get(id);if(!runtime)return;
    const lifecycleResponseId=event.responseId||runtime.activeResponseId||undefined;
    if(event.type==="started"){
      if(lifecycleResponseId){
        const stream=runtime.responseStreams.get(lifecycleResponseId);
        if(stream){
          const tail=releaseAfterPlayoutStarted(stream);
          if(tail.length)
            await this.enqueueResponseFrames(runtime,id,lifecycleResponseId,traceId,tail);
        }
      }
      const mediaMetrics=this.media.getProtocolMetrics(runtime.tenantId,runtime.mediaSessionId);
      runtime.coordinator.playoutStarted({
        responseRef:lifecycleResponseId,
        itemRef:runtime.activeItemId||undefined,
        queuedAudioMs:mediaMetrics?.queuedAudioMsCurrent,
      });
      runtime.closing.playoutStarted(lifecycleResponseId);
      runtime.handoff.playoutStarted(lifecycleResponseId);
      runtime.flusher.markDirty();
      return;
    }
    let farewellCompleted=false;
    if(event.type==="completed"){
      await this.transcriptService?.finalizeResponse(runtime.tenantId,id,lifecycleResponseId,event.playedAudioMs);
      if(lifecycleResponseId)runtime.responseStreams.delete(lifecycleResponseId);
      farewellCompleted=runtime.closing.playoutCompleted(lifecycleResponseId);
      const handoffStateBeforePlayout=runtime.handoff.state;
      const boundAnnouncementResponseId=runtime.handoff.announcementResponseId||undefined;
      const handoffResponseId=
        ["announcement_generating","announcement_playing"].includes(handoffStateBeforePlayout) &&
        boundAnnouncementResponseId
          ? boundAnnouncementResponseId
          : lifecycleResponseId;
      const handoffPlayoutCompleted=runtime.handoff.playoutCompleted(handoffResponseId);
      if(["announcement_generating","announcement_playing"].includes(handoffStateBeforePlayout)){
        await this.audit.append({
          tenantId:runtime.tenantId,
          traceId,
          actorType:"service",
          eventType:"human_handoff_playout_completed" as any,
          entityType:"realtime_voice_session",
          entityId:String(id),
          decision:handoffPlayoutCompleted?"accepted":"ignored",
          details:{
            stateBefore:handoffStateBeforePlayout,
            mediaResponseIdPresent:Boolean(event.responseId),
            mediaResponseMatchedBound:
              Boolean(event.responseId&&boundAnnouncementResponseId) &&
              event.responseId===boundAnnouncementResponseId,
            usedBoundAnnouncementResponseId:
              Boolean(boundAnnouncementResponseId) &&
              handoffResponseId===boundAnnouncementResponseId,
            playedAudioMs:event.playedAudioMs,
          },
        });
      }
      if(handoffPlayoutCompleted&&runtime.handoff.transferRequested()){
        runtime.blocked=true;runtime.responsePending=false;
        if(this.controlledHandoff&&runtime.handoffConfig)await this.controlledHandoff({tenantId:runtime.tenantId,voiceSessionId:runtime.voiceSessionId,traceId,config:runtime.handoffConfig,coordinator:runtime.handoff});
      }
    }
    runtime.coordinator.playoutFinished(event.type==="interrupted");
    if(
      event.type!=="interrupted" &&
      (!lifecycleResponseId||lifecycleResponseId===runtime.activeResponseId)
    ){
      runtime.responsePending=false;runtime.turnState="listening";
      runtime.activeResponseId=null;runtime.activeItemId=null;
      const current=await this.row(runtime.tenantId,id);
      if(current.state==="responding")await this.transition(runtime.tenantId,id,"listening",traceId);
    }
    if(runtime.pendingCallerCommit){
      runtime.pendingCallerCommit=false;
      await this.commit(runtime.tenantId,id,traceId);
    }
    if(runtime.deferredResponse&&!runtime.blocked){
      const deferred=runtime.deferredResponse;
      runtime.deferredResponse=null;
      if(runtime.closing.allowsNormalResponse()){
        runtime.responsePending=true;
        await this.createPlannedResponse(runtime,traceId);
      }
      void deferred;
    }
    if(farewellCompleted&&runtime.closing.hangupRequested()){
      try{
        const result=await this.controlledHangup?.({
          tenantId:runtime.tenantId,
          voiceSessionId:runtime.voiceSessionId,
          traceId,
        });
        if(result){
          runtime.closing.hangupConfirmed(result);
          runtime.closing.close();
          await this.repo.finalizeDeterministicHangup(
            runtime.tenantId,id,runtime.closing.snapshot(),result.confirmedAt,
          );
        }
        else runtime.closing.fail();
      }catch{
        runtime.closing.fail();
      }
    }else if(
      runtime.closing.state==="farewell_pending" &&
      !runtime.blocked
    ){
      await this.maybeStartFarewell(runtime,traceId);
    }
    runtime.flusher.markDirty();
  }
  private async maybeStartFarewell(runtime:Runtime,traceId:string){
    const providerActive=runtime.coordinator.providerState==="generating";
    const audibleActive=runtime.coordinator.audibleActive||Boolean(runtime.activeResponseId);
    if(!runtime.closing.canCreateFarewell(providerActive,audibleActive))return false;
    if(!runtime.closing.farewellRequested())return false;
    runtime.responsePending=true;
    const started=performance.now();
    try{
      await runtime.adapter.createFarewellResponse?.();
      runtime.responseCreateDispatchMs=Math.round(performance.now()-started);
      runtime.flusher.markDirty();
      return true;
    }catch(error){
      runtime.responsePending=false;
      runtime.closing.fail();
      throw error;
    }
  }
  private async createPlannedResponse(runtime:Runtime,traceId:string){
    if(!runtime.closing.allowsNormalResponse()){
      runtime.closing.duplicateResponsePrevented++;
      runtime.responsePending=false;
      return false;
    }
    if(
      runtime.coordinator.providerState==="generating" ||
      runtime.coordinator.audibleActive ||
      runtime.activeResponseId
    ){
      runtime.closing.duplicateResponsePrevented++;
      runtime.responsePending=false;
      return false;
    }
    if(!runtime.coordinator.requestResponseForTurn()){
      runtime.responsePending=false;
      return false;
    }
    if(runtime.currentPipeline)runtime.currentPipeline.plannerStartedAt=performance.now();
    let plan=runtime.pendingConversationIntentPlan||(runtime.receptionist
      ? planGenericResponse(runtime.taskState,runtime.skills)
      : null);
    runtime.pendingConversationIntentPlan=null;
    if(
      runtime.receptionist &&
      !runtime.taskState.activeSkillId &&
      runtime.skillRoutingDecision?.requiresClarification
    ){
      const configured=runtime.skills.find(skill=>
        skill.id===runtime.skillRoutingDecision?.alternatives[0]?.skillId);
      const text=configured?.responseTemplates.clarification||configured?.responseTemplates.fallback||null;
      plan={
        intent:"clarify",
        text,
        instructions:text?`Произнеси только: «${text}»`:"INTERNAL SAFE ERROR: clarification_template_missing.",
        errorCode:text?null:"clarification_template_missing",
        templateKey:text?(configured?.responseTemplates.clarification?"clarification":"fallback"):null,
        selectedAction:null,
      };
    }
    runtime.plannerDecision=plan?{
      intent:plan.intent,
      selectedAction:plan.selectedAction,
      templateKey:plan.templateKey,
    }:null;
    if(runtime.currentPipeline)runtime.currentPipeline.plannerDoneAt=performance.now();
    const started=performance.now();
    if(runtime.currentPipeline)runtime.currentPipeline.responseCreateAt=started;
    if(plan?.text){
      if(!runtime.adapter.createPlannedResponse)
        throw new RealtimeVoiceError("provider_not_ready",503,"Configured response renderer unavailable");
      await runtime.adapter.createPlannedResponse(plan.text,plan.instructions);
    }else
      await runtime.adapter.createResponse?.(plan?.instructions);
    runtime.responseCreateDispatchMs=Math.round(performance.now()-started);
    if(runtime.currentPipeline)runtime.currentPipeline.responseCreateDoneAt=performance.now();
    if(plan?.intent==="report_action_result"){
      runtime.actionResultReported=true;
      markGenericActionResultReported(runtime.taskState,runtime.skills);
    }
    runtime.flusher.markDirty();
    void traceId;
    return true;
  }
  private async handleEvent(
    id: number,
    traceId: string,
    event: RealtimeVoiceEvent,
  ) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    const row: any = {
      voice_session_id: runtime.voiceSessionId,
      media_session_id: runtime.mediaSessionId,
      state: null,
    };
    if (
      event.type === "response_started" ||
      event.type === "response_completed" ||
      event.type === "session_connected"
    )
      row.state = (await this.row(runtime.tenantId, id)).state;
    if (event.type === "session_connected" && event.providerSessionRef)
      await this.repo.providerSession(
        runtime.tenantId,
        id,
        event.providerSessionRef,
      );
    if (
      event.type === "response_started" &&
      !runtime.blocked &&
      (row.state === "listening" ||
        (row.state === "responding" &&
          (runtime.retryPendingFromResponseId ||
            runtime.closing.state==="farewell_generating")))
    ) {
      runtime.responsePending = false;
      runtime.activeResponseId = event.responseId || null;
      if(runtime.closing.state==="farewell_generating")
        runtime.closing.bindFarewellResponse(event.responseId);
      if(runtime.handoff.state==="announcement_generating")
        runtime.handoff.bindAnnouncement(event.responseId);
      runtime.activeItemId = null;
      runtime.responsePlayedMs = 0;
      runtime.currentTurnFirstOutputMonotonic = null;
      runtime.providerFirstDeltaMonotonic = null;
      runtime.responseGeneratedMs = 0;
      if(event.responseId)
        runtime.responseStreams.set(event.responseId,createResponseStreamState());
      runtime.turnState = "responding";
      runtime.coordinator.providerResponseStarted(event.responseId);
      if(runtime.retryPendingFromResponseId&&event.responseId){
        const previous=runtime.retryPendingFromResponseId;
        runtime.retryPendingFromResponseId=null;
        runtime.responseRetryCounts.set(event.responseId,1);
        if(runtime.fallbackPending){
          runtime.fallbackResponseIds.add(event.responseId);
          runtime.fallbackPending=false;
        }
        await this.transcriptService?.bindRetryResponse(
          runtime.tenantId,id,previous,event.responseId,
        );
      }
      if(row.state==="listening")
        await this.transition(runtime.tenantId, id, "responding", traceId);
    }
    if (event.type === "output_audio" && !runtime.blocked) {
      const responseId =
        event.responseId ||
        event.frame.responseId ||
        runtime.activeResponseId ||
        undefined;
      if (
        responseId &&
        (runtime.cancelledResponseIds.has(responseId) ||
          (runtime.activeResponseId && responseId !== runtime.activeResponseId))
      ) {
        runtime.staleDeltaIgnored++;
        runtime.flusher.markDirty();
        return;
      }
      runtime.providerFirstDeltaMonotonic ??= performance.now();
      if(runtime.currentPipeline)
        runtime.currentPipeline.providerFirstDeltaAt??=runtime.providerFirstDeltaMonotonic;
      if (
        responseId &&
        runtime.responseGeneratedMs + event.frame.durationMs >
          runtime.maxResponseAudioMs
      ) {
        const stream=runtime.responseStreams.get(responseId);
        if(stream)stream.hardSafetyReached=true;
        if (!runtime.cancelledResponseIds.has(responseId)) {
          runtime.cancelledResponseIds.add(responseId);
          runtime.controlledLimitResponseIds.add(responseId);
          runtime.responseLimitCancelCount++;
          if (runtime.coordinator.providerState === "generating") {
            await runtime.adapter.cancelResponse(responseId);
            runtime.coordinator.providerResponseCancelled(responseId);
          }
          await this.media.providerResponseDone(
            runtime.tenantId,
            runtime.mediaSessionId,
            responseId,
          );
          await this.transcriptService?.controlledLimit(
            runtime.tenantId,id,responseId,
          );
          await this.transcriptService?.completionReason(
            runtime.tenantId,id,responseId,"controlled_hard_safety",
          );
        } else runtime.duplicateCancelIgnored++;
        runtime.flusher.markDirty();
        return;
      }
      if(runtime.receptionist&&responseId){
        const stream=runtime.responseStreams.get(responseId)||
          createResponseStreamState();
        runtime.responseStreams.set(responseId,stream);
        const pushed=pushResponseFrame(stream,{
          ...event.frame,
          responseId,
          traceId,
          voiceSessionId:Number(row.voice_session_id),
          mediaSessionId:Number(row.media_session_id),
        },runtime.streamingPolicy.startupBufferMs);
        if(pushed.startupReady&&runtime.currentPipeline)
          runtime.currentPipeline.startupBufferReadyAt??=performance.now();
        runtime.responseGeneratedMs+=event.frame.durationMs;
        if(pushed.release.length)
          await this.enqueueResponseFrames(
            runtime,id,responseId,traceId,pushed.release,
          );
        runtime.flusher.markDirty();
        return;
      }
      const enqueue = await this.media.enqueueEgress(
        runtime.tenantId,
        Number(row.media_session_id),
        {
          ...event.frame,
          responseId,
          traceId,
          voiceSessionId: Number(row.voice_session_id),
          mediaSessionId: Number(row.media_session_id),
        },
      );
      if (!enqueue.accepted) {
        if (enqueue.reason === "response_limit" && responseId) {
          if (!runtime.cancelledResponseIds.has(responseId)) {
            runtime.cancelledResponseIds.add(responseId);
            runtime.controlledLimitResponseIds.add(responseId);
            runtime.responseLimitCancelCount++;
            if (runtime.coordinator.providerState === "generating") {
              await runtime.adapter.cancelResponse(responseId);
              runtime.coordinator.providerResponseCancelled(responseId);
            }
          } else runtime.duplicateCancelIgnored++;
        }
        runtime.flusher.markDirty();
        return;
      }
      runtime.outputFrames++;
      runtime.outputAudioMs += event.frame.durationMs;
      runtime.responseGeneratedMs += event.frame.durationMs;
      runtime.coordinator.updateQueuedAudio(
        this.media.getProtocolMetrics(
          runtime.tenantId,
          runtime.mediaSessionId,
        )?.queuedAudioMsCurrent || 0,
      );
      if (runtime.outputFrames === 1)
        await this.audit.append({
          tenantId: runtime.tenantId,
          traceId,
          actorType: "service",
          eventType: "realtime_first_audio",
          entityType: "realtime_voice_session",
          entityId: String(id),
          decision: "output",
          details: { firstResponseLatencyMs: runtime.firstResponseLatencyMs },
        });
    }
    if (event.type === "input_audio_stopped") {
      runtime.speechEndAt = Date.now();
      runtime.speechEndMonotonic = performance.now();
      runtime.speechAnchorSource = "provider_vad";
    }
    if (event.type === "input_audio_committed") {
      runtime.commitAt = Date.now();
      runtime.commitMonotonic = performance.now();
      runtime.commitAnchorSource = "provider_commit";
    }
    if (
      event.type === "response_item" &&
      event.status === "added" &&
      event.role === "assistant" &&
      event.itemId
    ) runtime.activeItemId = event.itemId;
    if (event.type === "transcript") {
      const text = redactAiPlatformText(event.text).slice(0, 1000);
      const extractionText=event.kind.startsWith("input_")
        ? String(event.extractionText??event.text).slice(0,1000)
        : text;
      if(event.kind==="input_final"){
        const finalKey=event.itemId||event.eventId||`${runtime.coordinator.callerTurnRef}:${extractionText}`;
        if(runtime.canonicalInputFinalKeys.has(finalKey))return;
        runtime.canonicalInputFinalKeys.add(finalKey);
        if(runtime.handoff.state==="awaiting_confirmation"){
          const decision=runtime.handoff.confirmation(extractionText);
          runtime.responsePending=false;
          if(decision==="confirmed")await this.startHandoffAnnouncement(runtime,id,traceId);
          else if(decision==="declined"){runtime.handoffConfig=null;runtime.responsePending=true;await runtime.adapter.createPlannedResponse?.("Хорошо. Чем ещё могу помочь?","Произнеси только указанную фразу.")}
          else if(decision==="ambiguous"){runtime.responsePending=true;await runtime.adapter.createPlannedResponse?.("Соединить вас с сотрудником? Ответьте, пожалуйста, да или нет.","Произнеси только указанную фразу.")}
          runtime.flusher.markDirty();return;
        }
      }
      if(event.kind.startsWith("input_"))
        redactAiPlatformText(extractionText,runtime.redactionCounts);
      if(event.responseId&&event.kind==="output_partial"){
        const accumulated=(
          (runtime.responseTranscripts.get(event.responseId)||"")+text
        ).slice(0,1000);
        runtime.responseTranscripts.set(event.responseId,accumulated);
        const stream=runtime.responseStreams.get(event.responseId);
        if(
          stream &&
          runtime.receptionist &&
          runtime.coordinator.providerState==="generating" &&
          sentenceBoundaryAfterWarning(
            stream,accumulated,runtime.streamingPolicy.warningMs,
          )
        ){
          runtime.sentenceStoppedResponseIds.add(event.responseId);
          runtime.cancelledResponseIds.add(event.responseId);
          await runtime.adapter.cancelResponse(event.responseId);
          runtime.coordinator.providerResponseCancelled(event.responseId);
          runtime.providerDoneResponseIds.add(event.responseId);
          await this.media.providerResponseDone(
            runtime.tenantId,runtime.mediaSessionId,event.responseId,
          );
          await this.transcriptService?.completionReason(
            runtime.tenantId,id,event.responseId,"controlled_sentence_stop",
          );
        }
      }
      if(event.kind==="output_final"&&event.responseId)
        runtime.responseTranscripts.set(event.responseId,text);
      if(event.kind==="input_partial"){
        runtime.callerPartialText = (
          runtime.callerPartialText + text
        ).slice(0,1000);
        runtime.coordinator.updateQueuedAudio(
          this.media.getProtocolMetrics(
            runtime.tenantId,
            runtime.mediaSessionId,
          )?.queuedAudioMsCurrent || 0,
        );
        const decision=runtime.coordinator.transcriptPartial(
          runtime.callerPartialText,
        );
        this.transcriptService?.turnDiagnostics(
          runtime.voiceSessionId,
          runtime.coordinator.snapshot(),
        );
        if(decision?.status==="confirmed")
          await this.applyCanonicalInterruption(runtime,id,traceId,decision);
      }
      if (
        event.kind.startsWith("output_") &&
        containsInternalAgentDisclosure(text)
      ) {
        await this.bargeIn(runtime.tenantId,id,traceId);
        return;
      }
      if (
        event.kind.startsWith("output_") &&
        isUnexpectedEnglishVoiceResponse(text) &&
        runtime.activeResponseId &&
        !runtime.languageCorrectedResponses.has(runtime.activeResponseId)
      ) {
        const rejectedResponse=runtime.activeResponseId;
        runtime.languageCorrectedResponses.add(rejectedResponse);
        if(runtime.coordinator.providerState==="generating"){
          await runtime.adapter.cancelResponse(rejectedResponse);
          runtime.coordinator.providerResponseCancelled(rejectedResponse);
        }
        runtime.cancelledResponseIds.add(rejectedResponse);
        await this.media.clearEgress(runtime.tenantId,runtime.mediaSessionId,rejectedResponse,"barge_in");
        runtime.responsePending=true;
        await runtime.adapter.createRussianCorrection?.();
        return;
      }
      if (!event.kind.endsWith("partial")) {
        runtime.transcripts.push({ kind: event.kind, text });
        if (runtime.transcripts.length > 20) runtime.transcripts.shift();
      }
      if(this.transcriptService)void this.transcriptService.transcript({
        tenantId:runtime.tenantId,voiceSessionId:runtime.voiceSessionId,
        mediaSessionId:runtime.mediaSessionId,realtimeSessionId:id,
        bindingId:runtime.routeBindingId,agentId:runtime.agentId,
        agentVersionId:runtime.agentVersionId,kind:event.kind,text,
        eventId:event.eventId,itemId:event.itemId,responseId:event.responseId,
        contentIndex:event.contentIndex,confidence:event.confidence,
      }).catch(()=>{});
      if(
        event.kind==="output_final" &&
        event.responseId &&
        runtime.controlledLimitResponseIds.has(event.responseId)
      )
        await this.transcriptService?.controlledLimit(
          runtime.tenantId,id,event.responseId,
        );
      if (event.kind === "input_final") {
        if(!runtime.currentPipeline)runtime.currentPipeline={
          actualSpeechEndEstimatedAt:null,vadStopAt:runtime.speechEndMonotonic,
          inputFinalAt:null,routingStartedAt:null,routingDoneAt:null,
          extractionStartedAt:null,extractionDoneAt:null,plannerStartedAt:null,
          plannerDoneAt:null,responseCreateAt:null,responseCreateDoneAt:null,
          providerFirstDeltaAt:null,startupBufferReadyAt:null,audibleStartAt:null,
          deterministicFastPath:false,classifierSkipped:false,llmExtractionSkipped:true,
        };
        runtime.currentPipeline.inputFinalAt=performance.now();
        runtime.callerPartialText=extractionText;
        runtime.coordinator.updateQueuedAudio(
          this.media.getProtocolMetrics(
            runtime.tenantId,
            runtime.mediaSessionId,
          )?.queuedAudioMsCurrent || 0,
        );
        const finalDecision=runtime.coordinator.transcriptPartial(text);
        if(finalDecision.status==="confirmed")
          await this.applyCanonicalInterruption(
            runtime,id,traceId,finalDecision,
          );
        runtime.coordinator.callerSpeechEnded();
        if(detectRealtimeTransfer(extractionText,this.handoffIntentPhrases(runtime))){
          await this.transfer(runtime,id,traceId,row,extractionText,"direct_request");
          runtime.flusher.markDirty();
          return;
        }
        if(!runtime.taskState.activeSkillId){
          runtime.currentPipeline.routingStartedAt=performance.now();
          runtime.skillRoutingDecision=await this.skillRouter.route(runtime.skills,extractionText);
          runtime.currentPipeline.routingDoneAt=performance.now();
          runtime.currentPipeline.deterministicFastPath=[
            "trigger","intent_example","description","extraction_hint",
          ].includes(runtime.skillRoutingDecision.classificationSource);
          runtime.currentPipeline.classifierSkipped=
            runtime.skillRoutingDecision.classificationSource!=="structured_classifier";
          applySkillRoutingDecision(runtime.taskState,runtime.skills,runtime.skillRoutingDecision);
          void this.audit.append({
            tenantId:runtime.tenantId,
            traceId,
            actorType:"service",
            eventType:"skill_routing_decision",
            entityType:"realtime_voice_session",
            entityId:String(id),
            decision:runtime.skillRoutingDecision.skillId?"activated":runtime.skillRoutingDecision.requiresClarification?"ambiguous":"none",
            details:runtime.skillRoutingDecision,
          }).catch(()=>{});
        }else{
          runtime.currentPipeline.routingStartedAt=runtime.currentPipeline.inputFinalAt;
          runtime.currentPipeline.routingDoneAt=runtime.currentPipeline.inputFinalAt;
          runtime.currentPipeline.deterministicFastPath=true;
          runtime.currentPipeline.classifierSkipped=true;
        }
        runtime.currentPipeline.extractionStartedAt=performance.now();
        updateGenericTaskState(runtime.taskState,runtime.skills,extractionText);
        runtime.currentPipeline.extractionDoneAt=performance.now();
        const conversationIntent=routeConfiguredConversationIntent(
          runtime.conversationIntentRoutes,
          extractionText,
        );
        runtime.lastConversationIntent=conversationIntent?{
          intentKey:conversationIntent.intentKey,
          matchedTrigger:conversationIntent.matchedTrigger,
          routeMode:conversationIntent.routeMode,
        }:null;
        const metaResponse=configuredMetaResponseForTurn(
          runtime.conversationIntentRoutes,
          extractionText,
          {
            actionResultReported:runtime.actionResultReported,
            activeSkillId:runtime.taskState.activeSkillId,
            lastUpdatedFields:runtime.taskState.lastUpdatedFields,
          },
        );
        if(metaResponse)runtime.pendingConversationIntentPlan={
          intent:"clarify",
          text:metaResponse.responseTemplate,
          instructions:`Произнеси только: «${metaResponse.responseTemplate}»`,
          errorCode:null,
          templateKey:`conversation_intent.${metaResponse.intentKey}`,
          selectedAction:null,
        };
        const stop=extractStopCommand(text),
          category=classifyCallerSpeech(text),
          responseText=stop?.semanticRemainder||text;
        if(runtime.receptionist&&isFarewellIntent(text)){
          const intent=runtime.closing.detectIntent(
            event.eventId||`${runtime.coordinator.callerTurnRef}:${text}`,
          );
          runtime.responsePending=false;
          if(intent.accepted)await this.maybeStartFarewell(runtime,traceId);
        }else if(!runtime.closing.allowsNormalResponse()){
          runtime.closing.duplicateResponsePrevented++;
          runtime.responsePending=false;
        }else if(!text.trim()){
          runtime.responsePending=false;
        }else if(stop){
          runtime.pendingStopRemainder=responseText;
          if(!responseText){
            runtime.responsePending=false;
          }else if(
            !runtime.blocked &&
            runtime.coordinator.requestResponseForTurn()
          ){
            runtime.responsePending=true;
            if(runtime.adapter.createResponseForRemainder)
              await runtime.adapter.createResponseForRemainder(
                event.itemId,
                responseText,
              );
            else await runtime.adapter.createResponse?.();
          }
        }else if(
          ["acknowledgement","laughter","cough","breath","noise"]
            .includes(category)
        ){
          runtime.responsePending=false;
        }else if(runtime.coordinator.audibleActive){
          runtime.deferredResponse={itemId:event.itemId,text:responseText};
          runtime.responsePending=false;
        }else{
          if (detectRealtimeTransfer(responseText,this.handoffIntentPhrases(runtime))){
            await this.transfer(runtime, id, traceId, row, responseText,"ai_offer");
            runtime.flusher.markDirty();
            return;
          }else if (callbackIntent(responseText))
            runtime.callbackOfferRequired = true;
          if (
            !runtime.blocked &&
            runtime.responsePending &&
            runtime.closing.allowsNormalResponse()
          )
            await this.createPlannedResponse(runtime,traceId);
        }
      }
    }
    if (event.type === "tool_call" && !runtime.blocked)
      await this.toolCall(runtime, id, traceId, event);
    if(event.type==='tool_call'&&this.transcriptService){const voice=(await this.store.query('SELECT route_binding_id,agent_id,agent_version_id FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1',[runtime.tenantId,runtime.voiceSessionId]))[0];if(voice)await this.transcriptService.marker({tenantId:runtime.tenantId,voiceSessionId:runtime.voiceSessionId,mediaSessionId:runtime.mediaSessionId,realtimeSessionId:id,bindingId:voice.route_binding_id?Number(voice.route_binding_id):null,agentId:Number(voice.agent_id),agentVersionId:Number(voice.agent_version_id),markerType:'tool_call',text:event.toolKey})}
    if (event.type === "output_audio" && runtime.outputFrames === 1)
      await this.liveObserver?.({
        tenantId: runtime.tenantId,
        voiceSessionId: Number(row.voice_session_id),
        type: "first_audio",
        latencyMs: runtime.firstResponseLatencyMs,
        traceId,
      });
    if (event.type === "response_completed") {
      if(event.usage&&this.transcriptService)await this.transcriptService.usage(runtime.tenantId,runtime.voiceSessionId,event.usage);
      if (event.responseId && event.responseId !== runtime.activeResponseId)
        return;
      const responseId=event.responseId,
        transcript=responseId
          ? runtime.responseTranscripts.get(responseId)||event.outputTranscript||""
          : event.outputTranscript||"",
        retryCount=responseId
          ? runtime.responseRetryCounts.get(responseId)||0
          : 0,
        stream=responseId
          ? runtime.responseStreams.get(responseId)
          : undefined,
        completion=mayRetryBeforePlayout({
          providerStatus:event.providerStatus,
          finishReason:event.finishReason,
          transcript,
          retryCount,
          framesSent:stream?.framesSent||0,
        }),
        semantic=completion.semantic,
        tokenLimited=completion.tokenLimited;
      if(responseId)
        await this.transcriptService?.providerOutcome(
          runtime.tenantId,
          id,
          responseId,
          {
            finishReason:event.finishReason||event.providerStatus||"unknown",
            outputTokenLimitHit:tokenLimited,
            semanticallyComplete:semantic.complete,
            retryCount,
          },
        );
      if(responseId)
        await this.transcriptService?.completionReason(
          runtime.tenantId,id,responseId,
          tokenLimited?"provider_token_truncated":"completed",
        );
      if(
        runtime.receptionist &&
        responseId &&
        completion.retry &&
        runtime.adapter.retryResponse
      ){
        runtime.tokenLimitHitCount++;
        runtime.semanticIncompleteCount++;
        runtime.responseStreams.delete(responseId);
        runtime.retryPendingFromResponseId=responseId;
        await this.transcriptService?.supersedeForRetry(
          runtime.tenantId,id,responseId,
        );
        await runtime.adapter.retryResponse(
          runtime.activeItemId||undefined,
          runtime.responseBudgets.retry,
        );
        runtime.flusher.markDirty();
        return;
      }
      if(!semantic.complete)runtime.semanticIncompleteCount++;
      if(runtime.receptionist&&responseId){
        if(tokenLimited)runtime.tokenLimitHitCount++;
        const responseStream=runtime.responseStreams.get(responseId);
        if(responseStream){
          const tail=releaseResponseTail(responseStream);
          if(tail.length)
            await this.enqueueResponseFrames(
              runtime,id,responseId,traceId,tail,
            );
        }
      }
      if(stream){
        stream.providerDoneAt??=performance.now();
        const latency=runtime.turnLatencies.at(-1);
        if(latency){
          latency.providerDoneMinusAudibleStartMs=
            runtime.currentTurnFirstOutputMonotonic===null
              ? null
              : Math.round(
                  stream.providerDoneAt-runtime.currentTurnFirstOutputMonotonic,
                );
          latency.totalResponseGenerationMs=
            stream.firstDeltaAt===null
              ? null
              : Math.max(0,Math.round(stream.providerDoneAt-stream.firstDeltaAt));
        }
      }
      if(event.responseId)runtime.providerDoneResponseIds.add(event.responseId);
      runtime.coordinator.providerResponseDone(event.responseId);
      if(event.responseId)await this.media.providerResponseDone(runtime.tenantId,runtime.mediaSessionId,event.responseId);
      await this.audit.append({
          tenantId: runtime.tenantId,
          traceId,
          actorType: "service",
          eventType: "realtime_response_completed",
          entityType: "realtime_voice_session",
          entityId: String(id),
          decision: "completed",
          details: {},
        });
    }
    if (event.type === "response_cancelled") {
      if(
        event.responseId &&
        (
          runtime.sentenceStoppedResponseIds.has(event.responseId) ||
          runtime.controlledLimitResponseIds.has(event.responseId)
        )
      ){
        runtime.providerDoneResponseIds.add(event.responseId);
        runtime.flusher.markDirty();
        return;
      }
      runtime.coordinator.providerResponseCancelled(event.responseId);
      if(event.responseId&&runtime.activeResponseId&&event.responseId!==runtime.activeResponseId){
        runtime.staleDeltaIgnored++;
      }else{
        runtime.responsePending = false;
        runtime.turnState="listening_after_interrupt";
        runtime.activeResponseId=null;
        runtime.activeItemId=null;
        if(runtime.closing.state==="farewell_pending")
          await this.maybeStartFarewell(runtime,traceId);
      }
    }
    if(event.type==='transcript_unavailable'&&this.transcriptService){const voice=(await this.store.query('SELECT route_binding_id,agent_id,agent_version_id FROM ai_voice_sessions WHERE tenant_id=? AND id=? LIMIT 1',[runtime.tenantId,runtime.voiceSessionId]))[0];if(voice)await this.transcriptService.marker({tenantId:runtime.tenantId,voiceSessionId:runtime.voiceSessionId,mediaSessionId:runtime.mediaSessionId,realtimeSessionId:id,bindingId:voice.route_binding_id?Number(voice.route_binding_id):null,agentId:Number(voice.agent_id),agentVersionId:Number(voice.agent_version_id),markerType:'transcript_unavailable',text:event.errorCode})}
    if (event.type === "error") {
      runtime.coordinator.providerResponseFailed();
      await this.fail(runtime.tenantId, id, traceId, event.errorCode);
    }
    runtime.flusher.markDirty();
  }
  private async transfer(
    runtime: Runtime,
    id: number,
    traceId: string,
    row: any,
    text: string,
    trigger:"direct_request"|"ai_offer",
  ) {
    const transferStarted = Date.now();
    runtime.transferRequired = true;
    if(runtime.closing.state!=="active"||runtime.handoff.state!=="idle")return;
    const config=runtime.handoffConfig||await this.handoffConfigResolver?.({tenantId:runtime.tenantId,agentId:runtime.agentId,agentVersionId:runtime.agentVersionId});
    if(!config){runtime.transferRequired=false;runtime.responsePending=true;await runtime.adapter.createPlannedResponse?.("Сейчас я не могу перевести звонок на сотрудника.","Произнеси только указанную фразу.");return}
    runtime.handoffConfig=config;
    const directConfirmation=Boolean(Number(config.direct_request_requires_confirmation??config.confirmation_required??0));
    const offerConfirmation=Boolean(Number(config.ai_offer_requires_confirmation??1));
    const requested=runtime.handoff.request({trigger,confirmationRequired:trigger==="ai_offer"?offerConfirmation:directConfirmation});
    if(!requested.accepted)return;
    await this.liveObserver?.({
      tenantId: runtime.tenantId,
      voiceSessionId: Number(row.voice_session_id),
      type: "transfer",
      latencyMs: Date.now() - transferStarted,
      traceId,
    });
    await this.audit.append({
      tenantId: runtime.tenantId,
      traceId,
      actorType: "service",
      eventType: "human_transfer_detected",
      entityType: "realtime_voice_session",
      entityId: String(id),
      decision: "transfer_required",
      details: {},
    });
    if(requested.needsConfirmation){runtime.responsePending=true;await runtime.adapter.createPlannedResponse?.("Соединить вас с сотрудником?","Произнеси только указанную фразу.");return}
    await this.startHandoffAnnouncement(runtime,id,traceId);
  }
  private handoffIntentPhrases(runtime:Runtime){
    try{
      const parsed=JSON.parse(String(runtime.handoffConfig?.intent_phrases_json||"[]"));
      return Array.isArray(parsed)?parsed.map(String).slice(0,50):[];
    }catch{return[]}
  }
  private async startHandoffAnnouncement(runtime:Runtime,id:number,traceId:string){
    if(!runtime.handoff.announcementRequested())return false;
    if(runtime.coordinator.providerState==="generating"){await runtime.adapter.cancelResponse(runtime.activeResponseId||undefined);runtime.coordinator.providerResponseCancelled(runtime.activeResponseId||undefined)}
    await this.media.clearEgress(runtime.tenantId,runtime.mediaSessionId,runtime.activeResponseId||undefined,"session_end");
    runtime.responsePending=true;runtime.activeResponseId=null;
    await runtime.adapter.createPlannedResponse?.(String(runtime.handoffConfig?.announcement_template||"Хорошо, соединяю вас с сотрудником."),"Произнеси только указанную фразу и после неё не добавляй ничего.");
    await this.audit.append({tenantId:runtime.tenantId,traceId,actorType:"service",eventType:"human_transfer_started",entityType:"realtime_voice_session",entityId:String(id),decision:"announcement_generating",details:{}});return true
  }
  private async toolCall(
    runtime: Runtime,
    id: number,
    traceId: string,
    event: Extract<RealtimeVoiceEvent, { type: "tool_call" }>,
  ) {
    runtime.toolCalls++;
    await this.audit.append({
      tenantId: runtime.tenantId,
      traceId,
      actorType: "service",
      eventType: "realtime_tool_call_requested",
      entityType: "realtime_voice_session",
      entityId: String(id),
      decision: "requested",
      details: { toolKey: event.toolKey },
    });
    if (runtime.toolCalls > 2) {
      await runtime.adapter.sendToolResult(event.callId, {
        ok: false,
        errorCode: "tool_loop_limit",
        message: customerSafeToolResult(false),
      });
      return;
    }
    const row = await this.row(runtime.tenantId, id),
      tools = await this.store.query(
        `SELECT t.id,t.tool_key FROM ai_agent_tools at JOIN ai_tools t ON t.id=at.tool_id WHERE at.tenant_id=? AND at.agent_version_id=(SELECT agent_version_id FROM ai_voice_sessions WHERE id=? AND tenant_id=?) AND at.enabled=1 AND t.enabled=1 AND t.risk_level='read' AND t.tool_key=? LIMIT 1`,
        [
          runtime.tenantId,
          row.voice_session_id,
          runtime.tenantId,
          event.toolKey,
        ],
      );
    if (!tools[0] || !this.toolExecutor) {
      await runtime.adapter.sendToolResult(event.callId, {
        ok: false,
        errorCode: "tool_not_available",
        message: customerSafeToolResult(false),
      });
      return;
    }
    const voice = (
      await this.store.query(
        "SELECT agent_id,agent_version_id,conversation_id FROM ai_voice_sessions WHERE tenant_id=? AND id=?",
        [runtime.tenantId, row.voice_session_id],
      )
    )[0];
    try {
      const result = await this.toolExecutor.execute(
        {
          traceId,
          tenantId: runtime.tenantId,
          installationId: "installation",
          actorId: runtime.actorId,
          actorType: "service",
          agentId: Number(voice.agent_id),
          agentVersionId: Number(voice.agent_version_id),
          conversationId: Number(voice.conversation_id),
          toolId: Number(tools[0].id),
          toolKey: event.toolKey,
          permissions: ["execute_ai_read_tools"],
          locale: "ru",
          requestStartedAt: new Date().toISOString(),
          idempotencyKey: `realtime:${id}:${event.callId}`,
        },
        event.arguments,
        runtime.aborter.signal,
      );
      await runtime.adapter.sendToolResult(event.callId, {
        ok: true,
        data: redactAiPlatformValue(result.data).value,
        message: customerSafeToolResult(true),
      });
      await this.audit.append({
        tenantId: runtime.tenantId,
        traceId,
        actorType: "service",
        eventType: "realtime_tool_call_completed",
        entityType: "realtime_voice_session",
        entityId: String(id),
        decision: "completed",
        details: { toolKey: event.toolKey },
      });
    } catch {
      await runtime.adapter.sendToolResult(event.callId, {
        ok: false,
        errorCode: "tool_failed",
        message: customerSafeToolResult(false),
      });
    }
  }
  private async persist(id: number) {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    const activeSkill=runtime.skills.find(skill=>skill.id===runtime.taskState.activeSkillId);
    const sensitiveKeys=new Set(activeSkill?.fields.filter(field=>field.sensitive).map(field=>field.key)||[]);
    const persistedTaskState={
      ...runtime.taskState,
      collectedFields:Object.fromEntries(Object.entries(runtime.taskState.collectedFields)
        .map(([key,value])=>[key,sensitiveKeys.has(key)?"[MASKED]":value])),
    };
    await this.repo.metrics(runtime.tenantId, id, {
      inputFrames: runtime.inputFrames,
      outputFrames: runtime.outputFrames,
      inputAudioMs: runtime.inputAudioMs,
      outputAudioMs: runtime.outputAudioMs,
      firstInputAt: runtime.firstInputAt
        ? new Date(runtime.firstInputAt)
        : null,
      firstOutputAt: runtime.firstOutputAt
        ? new Date(runtime.firstOutputAt)
        : null,
      firstResponseLatencyMs: runtime.firstResponseLatencyMs,
      speechEndToFirstAudioMs: runtime.speechEndToFirstAudioMs,
      commitToFirstAudioMs: runtime.commitToFirstAudioMs,
      sessionStartToFirstAudioMs: runtime.sessionStartToFirstAudioMs,
      interruptions: runtime.interruptions,
      toolCalls: runtime.toolCalls,
      metadata: redactAiPlatformValue({
        transcripts: runtime.transcripts,
        transferRequired: runtime.transferRequired,
        callbackOfferRequired: runtime.callbackOfferRequired,
        greetingStatus: runtime.greetingStatus,
        greetingStartedAt: runtime.greetingStartedAt,
        greetingCompletedAt: runtime.greetingCompletedAt,
        turnState: runtime.turnState,
        speechAnchorSource: runtime.speechAnchorSource,
        commitAnchorSource: runtime.commitAnchorSource,
        bargeInDetectedAt: runtime.bargeInDetectedAt,
        cancelSentAt: runtime.cancelSentAt,
        playoutStoppedAt: runtime.playoutStoppedAt,
        cancelLatencyMs: runtime.cancelLatencyMs,
        audibleStopLatencyMs: runtime.audibleStopLatencyMs,
        discardedBufferedAudioMs: runtime.discardedBufferedAudioMs,
        falseBargeInCount: runtime.falseBargeInCount,
        staleDeltaIgnored: runtime.staleDeltaIgnored,
        duplicateCancelIgnored: runtime.duplicateCancelIgnored,
        truncateSentCount: runtime.truncateSentCount,
        responseLimitCancelCount: runtime.responseLimitCancelCount,
        turnCoordinator: runtime.coordinator.snapshot(),
        pendingCallerCommit: runtime.pendingCallerCommit,
        responseGeneratedMs: runtime.responseGeneratedMs,
        maxResponseAudioMs: runtime.maxResponseAudioMs,
        canonicalInterruptionCount: runtime.canonicalInterruptionKeys.size,
        pendingStopRemainderPresent: Boolean(runtime.pendingStopRemainder),
        pendingStopDetectedAt: runtime.pendingStopDetectedAt,
        keywordToAudibleStopMs: runtime.keywordToAudibleStopMs,
        controlledLimitCount: runtime.controlledLimitResponseIds.size,
        responseBudgetUnits:runtime.responseBudgets.response,
        retryBudgetUnits:runtime.responseBudgets.retry,
        greetingBudgetUnits:runtime.responseBudgets.greeting,
        outputLimitHitCount:runtime.tokenLimitHitCount,
        semanticIncompleteCount:runtime.semanticIncompleteCount,
        delayedStreamingStartupMs:runtime.streamingPolicy.startupBufferMs,
        responseWarningMs:runtime.streamingPolicy.warningMs,
        bufferedResponseCount:[...runtime.responseStreams.values()]
          .filter(stream=>stream.buffered.length>0).length,
        streamingResponseCount:runtime.responseStreams.size,
        sentenceStoppedCount:runtime.sentenceStoppedResponseIds.size,
        personalitySchemaVersion:1,
        taskState:persistedTaskState,
        skillRoutingDecision:runtime.skillRoutingDecision,
        redactionCategoryCounts:runtime.redactionCounts,
        extractedFieldKeys:Object.keys(runtime.taskState.collectedFields),
        plannerDecision:runtime.plannerDecision,
        conversationIntentDecision:runtime.lastConversationIntent,
        actionResultReported:runtime.actionResultReported,
        closing:runtime.closing.snapshot(),
        callClosingState:runtime.closing.state,
        farewellCount:runtime.closing.farewellResponseCount,
        hangupActionCount:runtime.closing.hangupRequestedCount,
        commitDispatchMs:runtime.commitDispatchMs,
        responseCreateDispatchMs:runtime.responseCreateDispatchMs,
        speechEndToProviderFirstDeltaMs:
          runtime.speechEndMonotonic === null ||
          runtime.providerFirstDeltaMonotonic === null
            ? null
            : Math.max(
                0,
                Math.round(
                  runtime.providerFirstDeltaMonotonic -
                    runtime.speechEndMonotonic,
                ),
              ),
        providerFirstDeltaToPlayoutMs:
          runtime.providerFirstDeltaMonotonic === null ||
          runtime.firstOutputMonotonic === null
            ? null
            : Math.max(
                0,
                Math.round(
                  runtime.firstOutputMonotonic -
                    runtime.providerFirstDeltaMonotonic,
                ),
              ),
        speechEndToPlayoutMs: runtime.speechEndToFirstAudioMs,
        commitToPlayoutMs: runtime.commitToFirstAudioMs,
        queuedAudioAtFirstPlayoutMs: runtime.queuedAudioAtFirstPlayoutMs,
        turnLatencies: runtime.turnLatencies,
        playout: this.media.getProtocolMetrics(
          runtime.tenantId,
          runtime.mediaSessionId,
        ),
        providerOutput: runtime.adapter.getOutputMetrics?.() || null,
      }).value,
    });
  }
  async fixture(
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
    const row = await this.row(tenantId, id);
    await this.media.injectRealtimeFixture(
      tenantId,
      Number(row.media_session_id),
      fixture,
      traceId,
    );
    return this.get(tenantId, id);
  }
  async closeForMediaSession(
    tenantId: number,
    mediaSessionId: number,
    traceId: string,
  ) {
    const row = (await this.repo.findActive(tenantId, mediaSessionId))[0];
    return row ? this.stop(tenantId, Number(row.id), traceId) : null;
  }
  setLiveObserver(
    observer: (event: {
      tenantId: number;
      voiceSessionId: number;
      type: "first_audio" | "barge_in" | "transfer";
      latencyMs: number | null;
      traceId: string;
    }) => Promise<void>,
  ) {
    this.liveObserver = observer;
  }
  async stop(
    tenantId: number,
    id: number,
    traceId: string,
    terminal: "completed" | "cancelled" = "completed",
  ) {
    const runtime = this.runtimes.get(id);
    if (runtime && runtime.tenantId !== tenantId)
      throw new RealtimeVoiceError(
        "not_found",
        404,
        "Realtime session not found",
      );
    if (runtime) {
      runtime.blocked = true;
      runtime.closing.close();
      runtime.coordinator.callEnding();
      if(runtime.interruptionTimer){
        clearTimeout(runtime.interruptionTimer);
        runtime.interruptionTimer=null;
      }
      if(runtime.activeResponseId)await this.transcriptService?.interrupt(tenantId,id,runtime.voiceSessionId,runtime.activeResponseId,runtime.responsePlayedMs,true);
      await this.media.clearEgress(tenantId,runtime.mediaSessionId,runtime.activeResponseId||undefined,"session_end");
      runtime.aborter.abort();
      runtime.unsubscribeMedia();
      runtime.unsubscribeVad();
      runtime.unsubscribePlayout();
      runtime.unsubscribePlayoutLifecycle();
      runtime.unsubscribeProvider();
      await runtime.adapter.close();
      await runtime.flusher.final(1000);
      await this.transcriptService?.complete(tenantId,id,runtime.voiceSessionId);
      this.runtimes.delete(id);
    }
    const row = await this.row(tenantId, id);
    if (!["completed", "failed", "cancelled"].includes(row.state)) {
      if (row.state !== "closing")
        await this.transition(tenantId, id, "closing", traceId);
      await this.transition(tenantId, id, terminal, traceId);
    }
    await this.store.query(
      "UPDATE ai_voice_sessions v JOIN ai_realtime_voice_sessions r ON r.voice_session_id=v.id SET v.provider_state='disconnected' WHERE r.tenant_id=? AND r.id=?",
      [tenantId, id],
    );
    return this.get(tenantId, id);
  }
  async fail(tenantId: number, id: number, traceId: string, code: string) {
    const runtime = this.runtimes.get(id);
    if (runtime) {
      runtime.blocked = true;
      runtime.coordinator.callEnding();
      if(runtime.interruptionTimer){
        clearTimeout(runtime.interruptionTimer);
        runtime.interruptionTimer=null;
      }
      runtime.aborter.abort();
      runtime.unsubscribeMedia();
      runtime.unsubscribeVad();
      runtime.unsubscribePlayout();
      runtime.unsubscribeProvider();
      await runtime.adapter.close().catch(() => {});
      await runtime.flusher.final(1000);
      await this.transcriptService?.complete(tenantId,id,runtime.voiceSessionId);
      this.runtimes.delete(id);
    }
    const row = await this.row(tenantId, id);
    if (!["failed", "completed", "cancelled"].includes(row.state))
      await this.transition(tenantId, id, "failed", traceId, code);
    return this.get(tenantId, id);
  }
  activeCount() {
    return this.runtimes.size;
  }
  async shutdown() {
    for (const [id, runtime] of [...this.runtimes])
      await this.stop(runtime.tenantId, id, "shutdown", "cancelled").catch(
        () => {},
      );
  }
}
