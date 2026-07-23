import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";
import type { AiAuditService } from "../../audit/aiAuditService.js";
import type { MediaSessionService } from "../media/mediaSessionService.js";
import type { RealtimeVoiceSessionService } from "../providers/realtimeVoiceSessionService.js";
import type { AriConnectionManager } from "../ari/ariConnectionManager.js";
import type { VoiceGatewayService } from "../voiceGatewayService.js";
import { VoiceEncryptionService, voiceHash } from "../voiceEncryption.js";
import { readAudioSocketServerConfig } from "../media/transports/audioSocketAdapter.js";
import { readLiveVoiceConfig, safeExtensionLabel } from "./liveVoiceConfig.js";
import { buildLiveDialplanPreview } from "./liveDialplanPreview.js";
import { LiveBridgeService } from "./liveBridgeService.js";
import type { LiveReadiness, LiveRuntimeMetrics } from "./liveVoiceTypes.js";
import { AiPlatformError } from "../../core/errors.js";
import { readOpenAIRealtimeConfig } from "../providers/adapters/openaiRealtimeAdapter.js";
import type { VoiceRecordingReconciliationService } from "../recordings/voiceRecordingReconciliationService.js";

export class ControlledLiveVoiceService {
  private active = new Map<
    number,
    {
      tenantId: number;
      mediaSessionId: number;
      realtimeSessionId: number;
      callerChannel: string;
      metrics: LiveRuntimeMetrics;
    }
  >();
  constructor(
    private store: AiPlatformStore,
    private audit: AiAuditService,
    private gateway: VoiceGatewayService,
    private manager: AriConnectionManager,
    private media: MediaSessionService,
    private realtime: RealtimeVoiceSessionService,
    private bridges: LiveBridgeService,
    private recordings: VoiceRecordingReconciliationService | null = null,
  ) {}
  async readiness(tenantId: number): Promise<LiveReadiness> {
    const config = await readLiveVoiceConfig(this.store),
      flags = await this.store.query(
        "SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.platform_core_enabled','ai.voice_control_plane_enabled','ai.voice_media_transport_enabled','ai.realtime_voice_enabled','ai.voice_live_test_enabled')",
      ),
      map = new Map(
        flags.map((row: any) => [row.setting_key, row.setting_value]),
      ),
      binding = (
        await this.store.query(
          `SELECT b.id,v.lifecycle_status FROM ai_voice_route_bindings b JOIN ai_agent_versions v ON v.id=b.agent_version_id AND v.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.match_type='controlled_test_extension' AND b.status='active' AND b.dry_run_only=0 LIMIT 1`,
          [tenantId],
        )
      )[0],
      audio = readAudioSocketServerConfig(),
      items = [
        [
          "core",
          map.get("ai.platform_core_enabled") === "true",
          "feature_disabled",
        ],
        [
          "controlPlane",
          map.get("ai.voice_control_plane_enabled") === "true",
          "feature_disabled",
        ],
        [
          "media",
          map.get("ai.voice_media_transport_enabled") === "true",
          "feature_disabled",
        ],
        [
          "realtime",
          map.get("ai.realtime_voice_enabled") === "true",
          "feature_disabled",
        ],
        [
          "liveTest",
          map.get("ai.voice_live_test_enabled") === "true",
          "feature_disabled",
        ],
        [
          "testExtension",
          Boolean(config.testExtension),
          "test_extension_not_configured",
        ],
        ["dialplan", config.dialplanConfirmed, "dialplan_not_confirmed"],
        [
          "allowedCallers",
          config.allowedCallers.length > 0,
          "caller_allowlist_empty",
        ],
        ["ari", this.manager.status().state === "connected", "ari_unavailable"],
        [
          "encryption",
          new VoiceEncryptionService().ready(),
          "encryption_not_configured",
        ],
        ["audioSocket", audio.port > 0, "live_media_not_configured"],
        [
          "publishedAgent",
          binding?.lifecycle_status === "published",
          "binding_not_ready",
        ],
        [
          "provider",
          config.provider === "synthetic" ||
            (config.provider === "openai_realtime" &&
              readOpenAIRealtimeConfig().configured),
          "provider_not_configured",
        ],
      ] as const;
    return {
      ready: items.every((item) => item[1]),
      items: items.map(([key, ready, code]) => ({
        key,
        ready,
        code: ready ? null : code,
      })),
      safe: {
        extensionLabel: safeExtensionLabel(config.testExtension),
        transport: "audiosocket",
        provider: config.provider,
        allowedCallersCount: config.allowedCallers.length,
        stasisApplication: config.stasisApplication,
      },
    };
  }
  async status(tenantId: number) {
    const readiness = await this.readiness(tenantId),
      config = await readLiveVoiceConfig(this.store),
      metrics = await this.store.query(
        `SELECT metadata_json FROM ai_voice_sessions WHERE tenant_id=? ORDER BY id DESC LIMIT 100`,
        [tenantId],
      );
    const values = metrics.flatMap((row: any) => {
        try {
          const metadata = JSON.parse(row.metadata_json);
          return metadata?.controlledLive && metadata?.liveMetrics
            ? [metadata.liveMetrics]
            : [];
        } catch {
          return [];
        }
      }),
      percentile = (key: string, p: number) => {
        const sorted = values
          .map((v: any) => Number(v[key]))
          .filter(Number.isFinite)
          .sort((a: number, b: number) => a - b);
        return sorted.length
          ? sorted[
              Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))
            ]
          : null;
      };
    return {
      enabled: config.enabled,
      ready: readiness.ready,
      readiness,
      activeSessions: [...this.active.values()].filter(
        (value) => value.tenantId === tenantId,
      ).length,
      metrics: {
        startupP50Ms: percentile("startupMs", 0.5),
        startupP95Ms: percentile("startupMs", 0.95),
        bargeInP50Ms: percentile("bargeInMs", 0.5),
        bargeInP95Ms: percentile("bargeInMs", 0.95),
        firstAudioP50Ms: percentile("firstAudioMs", 0.5),
        firstAudioP95Ms: percentile("firstAudioMs", 0.95),
      },
      productionBindingsEnabled: false,
    };
  }
  async guard(input: any) {
    const config = await readLiveVoiceConfig(this.store),
      readiness = await this.readiness(input.tenantId),
      caller = String(
        input.raw?.channel?.caller?.number || input.raw?.caller || "",
      ).replace(/\D/g, "");
    if (!config.enabled || !readiness.ready)
      throw new AiPlatformError(
        "feature_disabled",
        503,
        "Controlled live voice test is not ready",
      );
    if (!config.allowedCallers.includes(caller)) {
      await this.audit.append({
        tenantId: input.tenantId,
        traceId: input.traceId,
        actorType: "service",
        eventType: "live_voice_call_rejected" as any,
        entityType: "voice_live_test",
        decision: "caller_not_allowed",
        details: {
          callerHash: caller ? voiceHash(input.tenantId, caller) : null,
        },
      });
      throw new AiPlatformError(
        "permission_denied",
        403,
        "Caller is not allowed for controlled live test",
      );
    }
    await this.audit.append({
      tenantId: input.tenantId,
      traceId: input.traceId,
      actorType: "service",
      eventType: "live_voice_call_matched" as any,
      entityType: "voice_live_test",
      decision: "matched",
      details: { bindingId: input.binding.id },
    });
  }
  async start(input: any) {
    const started = Date.now(),
      config = await readLiveVoiceConfig(this.store),
      callerChannel = input.event.trustedChannelRef;
    if (!callerChannel)
      throw new AiPlatformError(
        "live_context_required",
        409,
        "Trusted caller channel is unavailable",
      );
    await this.audit.append({
      tenantId: input.tenantId,
      traceId: input.traceId,
      actorType: "service",
      eventType: "live_voice_session_starting" as any,
      entityType: "voice_session",
      entityId: String(input.session.id),
      decision: "starting",
      details: { transport: "audiosocket", provider: config.provider },
    });
    let mediaSessionId = 0,
      ready = false;
    try {
      const prepared = await this.media.prepareLiveAudioSocket({
        tenantId: input.tenantId,
        voiceSessionId: input.session.id,
        traceId: input.traceId,
      });
      mediaSessionId = prepared.id;
      const bridge = await this.bridges.create(
          input.session.id,
          callerChannel,
          prepared.endpoint.externalHost,
          prepared.endpoint.connectionId,
          config.stasisApplication,
        ),
        encryption = new VoiceEncryptionService();
      await this.store.query(
        "UPDATE ai_voice_sessions SET ari_bridge_id_encrypted=?,ari_bridge_id_hash=?,metadata_json=? WHERE tenant_id=? AND id=?",
        [
          encryption.encrypt(bridge.bridgeId),
          voiceHash(input.tenantId, bridge.bridgeId),
          JSON.stringify({ controlledLive: true }),
          input.tenantId,
          input.session.id,
        ],
      );
      await this.media.startPreparedLive(
        input.tenantId,
        mediaSessionId,
        input.traceId,
      );
      const realtime = await this.realtime.start({
        tenantId: input.tenantId,
        mediaSessionId,
        providerKey: config.provider,
        traceId: input.traceId,
        actorId: "voice-live",
      });
      await this.bridges.answer(input.session.id, callerChannel);
      const metrics = {
        startupMs: Date.now() - started,
        firstAudioMs: null,
        bargeInMs: null,
        transferStartMs: null,
        controlOperationDelayMs: 0,
        greetingStartDelayMs: null,
        startedAt: started,
      };
      this.active.set(input.session.id, {
        tenantId: input.tenantId,
        mediaSessionId,
        realtimeSessionId: realtime.id,
        callerChannel,
        metrics,
      });
      await this.audit.append({
        tenantId: input.tenantId,
        traceId: input.traceId,
        actorType: "service",
        eventType: "live_voice_session_ready" as any,
        entityType: "voice_session",
        entityId: String(input.session.id),
        decision: "ready",
        details: { startupMs: metrics.startupMs, transport: "audiosocket" },
      });
      ready = true;
      metrics.greetingStartDelayMs = Date.now() - started;
      await this.realtime.startInitialGreeting(
        input.tenantId,
        realtime.id,
        input.traceId,
        "Здравствуйте. Чем могу помочь?",
      );
    } catch (error) {
      if (mediaSessionId)
        await this.media
          .stop(input.tenantId, mediaSessionId, input.traceId, "cancelled")
          .catch(() => {});
      await this.bridges.cleanup(input.session.id);
      await this.bridges.releaseCaller(callerChannel);
      await this.gateway.sessions
        .transition(
          input.tenantId,
          input.session.id,
          "failed",
          input.traceId,
          ready ? "media_runtime_failed" : "live_startup_failed",
        )
        .catch(() => {});
      await this.audit.append({
        tenantId: input.tenantId,
        traceId: input.traceId,
        actorType: "service",
        eventType: "live_voice_session_failed" as any,
        entityType: "voice_session",
        entityId: String(input.session.id),
        decision: "failed",
        details: {
          errorCode: ready ? "media_runtime_failed" : "live_startup_failed",
        },
      });
      throw new AiPlatformError(
        "internal_error",
        502,
        ready
          ? "Controlled live voice runtime failed"
          : "Controlled live voice startup failed",
      );
    }
  }
  async cleanup(tenantId: number, voiceSessionId: number, traceId: string) {
    const active = this.active.get(voiceSessionId);
    if (!active || active.tenantId !== tenantId) {
      await this.bridges.cleanup(voiceSessionId);
      return;
    }
    this.active.delete(voiceSessionId);
    await this.realtime
      .stop(tenantId, active.realtimeSessionId, traceId, "completed")
      .catch(() => {});
    await this.media
      .stop(tenantId, active.mediaSessionId, traceId)
      .catch(() => {});
    await this.bridges.cleanup(voiceSessionId);
    await this.store.query(
      "UPDATE ai_voice_sessions SET metadata_json=? WHERE tenant_id=? AND id=?",
      [
        JSON.stringify({ controlledLive: true, liveMetrics: active.metrics }),
        tenantId,
        voiceSessionId,
      ],
    );
    await this.audit.append({
      tenantId,
      traceId,
      actorType: "service",
      eventType: "live_voice_cleanup_completed" as any,
      entityType: "voice_session",
      entityId: String(voiceSessionId),
      decision: "completed",
      details: {},
    });
    this.recordings?.schedule(tenantId,voiceSessionId,traceId);
  }
  async durationLimit(tenantId:number,mediaSessionId:number,traceId:string){
    const entry=[...this.active.entries()].find(([,value])=>value.tenantId===tenantId&&value.mediaSessionId===mediaSessionId);
    if(!entry)return this.media.stop(tenantId,mediaSessionId,traceId,"completed");
    const [voiceSessionId,active]=entry;
    await this.store.query("UPDATE ai_voice_sessions SET completion_reason='duration_limit' WHERE tenant_id=? AND id=?",[tenantId,voiceSessionId]);
    await this.cleanup(tenantId,voiceSessionId,traceId);
    await this.bridges.releaseCaller(active.callerChannel).catch(()=>{});
  }
  async deterministicHangup(tenantId:number,voiceSessionId:number,traceId:string){
    const active=this.active.get(voiceSessionId);
    if(!active||active.tenantId!==tenantId)
      throw new AiPlatformError("not_found",404,"Controlled live voice session is unavailable");
    const requestedAt=Date.now(),
      actionRefSafe=`hangup_${voiceHash(tenantId,`${voiceSessionId}:${requestedAt}`).slice(0,24)}`;
    await this.audit.append({
      tenantId,traceId,actorType:"service",
      eventType:"live_voice_hangup_requested" as any,
      entityType:"voice_session",entityId:String(voiceSessionId),
      decision:"requested",details:{
        policy:"controlled_farewell",
        hangupActionRefSafe:actionRefSafe,
      },
    });
    await this.store.query(
      "UPDATE ai_voice_sessions SET completion_reason='ai_deterministic_hangup',hangup_action_ref_safe=?,hangup_requested_at=NOW(3) WHERE tenant_id=? AND id=?",
      [actionRefSafe,tenantId,voiceSessionId],
    );
    try{
      await this.bridges.hangupCaller(active.callerChannel);
    }catch{
      await this.store.query(
        "UPDATE ai_voice_sessions SET hangup_ari_result='failed',hangup_failure_code_safe='ari_hangup_failed' WHERE tenant_id=? AND id=?",
        [tenantId,voiceSessionId],
      );
      await this.audit.append({
        tenantId,traceId,actorType:"service",
        eventType:"live_voice_hangup_failed" as any,
        entityType:"voice_session",entityId:String(voiceSessionId),
        decision:"failed",details:{
          hangupActionRefSafe:actionRefSafe,
          failureCodeSafe:"ari_hangup_failed",
        },
      });
      throw new AiPlatformError("internal_error",502,"Controlled hangup failed");
    }
    const confirmedAt=Date.now(),latencyMs=confirmedAt-requestedAt;
    await this.store.query(
      "UPDATE ai_voice_sessions SET hangup_confirmed_at=NOW(3),hangup_latency_ms=?,hangup_ari_result='confirmed',hangup_failure_code_safe=NULL WHERE tenant_id=? AND id=?",
      [latencyMs,tenantId,voiceSessionId],
    );
    await this.audit.append({
      tenantId,traceId,actorType:"service",
      eventType:"live_voice_hangup_confirmed" as any,
      entityType:"voice_session",entityId:String(voiceSessionId),
      decision:"confirmed",details:{
        policy:"controlled_farewell",
        hangupActionRefSafe:actionRefSafe,
        latencyMs,
        ariResult:"confirmed",
      },
    });
    return {
      actionRefSafe,
      requestedAt,
      confirmedAt,
      latencyMs,
      ariResult:"confirmed" as const,
      failureCodeSafe:null,
    };
  }
  async observe(event: {
    tenantId: number;
    voiceSessionId: number;
    type: "first_audio" | "barge_in" | "transfer";
    latencyMs: number | null;
    traceId: string;
  }) {
    const active = this.active.get(event.voiceSessionId);
    if (!active || active.tenantId !== event.tenantId) return;
    if (event.type === "first_audio")
      active.metrics.firstAudioMs = event.latencyMs;
    if (event.type === "barge_in") active.metrics.bargeInMs = event.latencyMs;
    if (event.type === "transfer")
      active.metrics.transferStartMs = event.latencyMs;
    const eventType =
      event.type === "first_audio"
        ? "live_voice_first_audio"
        : event.type === "barge_in"
          ? "live_voice_barge_in"
          : "live_voice_transfer_requested";
    await this.audit.append({
      tenantId: event.tenantId,
      traceId: event.traceId,
      actorType: "service",
      eventType: eventType as any,
      entityType: "voice_session",
      entityId: String(event.voiceSessionId),
      decision: event.type,
      details: { latencyMs: event.latencyMs },
    });
  }
  async setEnabled(tenantId: number, enabled: boolean, traceId: string) {
    if (enabled) {
      const readiness = await this.readiness(tenantId),
        blocking = readiness.items.filter(
          (item) => !item.ready && item.key !== "liveTest",
        );
      if (blocking.length)
        throw new AiPlatformError(
          "conflict",
          409,
          "Live voice readiness checks failed",
        );
      await this.store.query(
        "UPDATE settings SET setting_value='true' WHERE setting_key='ai.voice_live_test_enabled'",
      );
    } else {
      await this.store.query(
        "UPDATE settings SET setting_value='false' WHERE setting_key='ai.voice_live_test_enabled'",
      );
      for (const [id, value] of [...this.active])
        if (value.tenantId === tenantId)
          await this.cleanup(tenantId, id, traceId);
    }
    await this.audit.append({
      tenantId,
      traceId,
      actorType: "user",
      eventType: (enabled
        ? "live_voice_test_enabled"
        : "live_voice_test_disabled") as any,
      entityType: "voice_live_test",
      decision: enabled ? "enabled" : "disabled",
      details: {},
    });
    return this.status(tenantId);
  }
  async dialplanPreview() {
    return buildLiveDialplanPreview(await readLiveVoiceConfig(this.store));
  }
}
