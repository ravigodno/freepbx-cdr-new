import type { Express } from 'express';
import { AiPlatformError } from '../../../core/errors.js';
import type { MediaSessionService } from '../mediaSessionService.js';
import type { MediaTransportRegistry } from '../mediaTransportRegistry.js';
import { readVoiceMediaSettings } from '../mediaGatewayControl.js';

export function registerVoiceMediaRoutes(app: Express, runtime: any, service: MediaSessionService, registry: MediaTransportRegistry) {
  const { authenticated, permit, wrap, getTenantId, actor, store, positiveInt, page } = runtime;
  const hits = new Map<string, number[]>();
  const consume = (key: string) => {
    const now = Date.now();
    for (const [entry, values] of hits) if (!values.some(value => now - value < 60_000)) hits.delete(entry);
    const values = (hits.get(key) || []).filter(value => now - value < 60_000);
    if (values.length >= 60) throw new AiPlatformError('rate_limited', 429, 'Synthetic media rate limit exceeded');
    values.push(now); hits.set(key, values);
  };
  app.get('/api/ai-platform/voice/media/status', ...authenticated, permit('view_ai_voice_media_status'), wrap(async (_req: any, res: any) => {
    const tenantId = await getTenantId(), settings = await readVoiceMediaSettings(store);
    const rows = await store.query("SELECT COUNT(*) total,SUM(state NOT IN('completed','failed','cancelled')) active FROM ai_voice_media_sessions WHERE tenant_id=?", [tenantId]);
    res.json({ success: true, data: { featureEnabled: settings.enabled, selectedMode: settings.mode, activeSessions: Number(rows[0]?.active || 0), totalSessions: Number(rows[0]?.total || 0), transports: registry.list(), preferredInternalFormat: { codec: 'slin16', sampleRate: 16000, channels: 1 }, realtimeProviderReady: false, liveMediaReady: false } });
  }));
  app.get('/api/ai-platform/voice/media/sessions', ...authenticated, permit('view_ai_voice_media_sessions'), wrap(async (req: any, res: any) => {
    const tenantId = await getTenantId(), paging = page(req), rows = await service.list(tenantId, paging.limit, paging.offset), count = await store.query('SELECT COUNT(*) total FROM ai_voice_media_sessions WHERE tenant_id=?', [tenantId]);
    res.json({ success: true, rows, pagination: { page: Math.floor(paging.offset / paging.limit) + 1, limit: paging.limit, total: Number(count[0]?.total || 0) } });
  }));
  app.get('/api/ai-platform/voice/media/sessions/:id', ...authenticated, permit('view_ai_voice_media_sessions'), wrap(async (req: any, res: any) => res.json({ success: true, data: await service.get(await getTenantId(), positiveInt(req.params.id, 'media session id')) })));
  app.post('/api/ai-platform/voice/media/test/start', ...authenticated, permit('test_ai_voice_media'), wrap(async (req: any, res: any) => {
    const tenantId = await getTenantId(), currentActor = actor(req); consume(`${tenantId}:${currentActor.actorId}`);
    const settings = await readVoiceMediaSettings(store); if (!settings.enabled) throw new AiPlatformError('feature_disabled', 503, 'Voice media transport is disabled');
    if (req.body?.transportMode && req.body.transportMode !== 'synthetic') throw new AiPlatformError('feature_disabled', 503, 'Live media transports are disabled');
    await runtime.audit.append({ tenantId, ...currentActor, eventType: 'synthetic_media_test_started', entityType: 'voice_media_session', decision: 'started', details: { transportMode: 'synthetic' } });
    const data = await service.createSynthetic({ tenantId, voiceSessionId: positiveInt(req.body?.voiceSessionId, 'voice session id'), traceId: currentActor.traceId });
    res.status(201).json({ success: true, data });
  }));
  app.post('/api/ai-platform/voice/media/test/frame', ...authenticated, permit('test_ai_voice_media'), wrap(async (req: any, res: any) => {
    const tenantId = await getTenantId(), currentActor = actor(req); consume(`${tenantId}:${currentActor.actorId}`);
    if (req.body?.payload || req.body?.audio || req.body?.base64) throw new AiPlatformError('invalid_request', 400, 'Raw audio payload is forbidden');
    const fixture = String(req.body?.fixture || ''); if (!['silence', 'speech', 'noise', 'reordered_sequence', 'duplicate_sequence', 'packet_loss'].includes(fixture)) throw new AiPlatformError('invalid_request', 400, 'Invalid synthetic fixture');
    res.json({ success: true, data: await service.fixture(tenantId, positiveInt(req.body?.mediaSessionId, 'media session id'), fixture as any, Math.max(1, Math.min(Number(req.body?.count) || 1, 100)), currentActor.traceId) });
  }));
  app.post('/api/ai-platform/voice/media/test/barge-in', ...authenticated, permit('test_ai_voice_media'), wrap(async (req: any, res: any) => {
    const tenantId = await getTenantId(), currentActor = actor(req); consume(`${tenantId}:${currentActor.actorId}`);
    res.json({ success: true, data: await service.bargeIn(tenantId, positiveInt(req.body?.mediaSessionId, 'media session id'), currentActor.traceId) });
  }));
  app.post('/api/ai-platform/voice/media/test/stop', ...authenticated, permit('test_ai_voice_media'), wrap(async (req: any, res: any) => {
    const tenantId = await getTenantId(), currentActor = actor(req), data = await service.stop(tenantId, positiveInt(req.body?.mediaSessionId, 'media session id'), currentActor.traceId);
    await runtime.audit.append({ tenantId, ...currentActor, eventType: 'synthetic_media_test_completed', entityType: 'voice_media_session', entityId: String(data.id), decision: 'completed', details: { frames: data.ingressFrames + data.egressFrames } });
    res.json({ success: true, data });
  }));
}
