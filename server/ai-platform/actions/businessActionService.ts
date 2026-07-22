import { isAiPlatformCoreEnabled } from '../core/featureFlag.js';
import { redactAiPlatformValue } from '../core/redaction.js';
import type { AiAuditService } from '../audit/aiAuditService.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import { ActionRepository } from './actionRepository.js';
import { ActionDefinitionRegistry } from './actionDefinitionRegistry.js';
import { ActionExecutorRegistry } from './actionExecutorRegistry.js';
import { ActionRateLimiter } from './actionRateLimiter.js';
import { normalizePhone, tenantPhoneHash } from './applicationEncryption.js';
import { enforceActionPolicy } from './actionPolicyEngine.js';
import { validateActionInput } from './actionInputValidator.js';
import { validateActionOutput } from './actionOutputValidator.js';
import { BusinessActionError } from './actionErrors.js';
import type { BusinessActionContext, BusinessActionResult, CallbackActionInput } from './actionTypes.js';

export class BusinessActionService {
  private readonly repo: ActionRepository;
  private readonly limiter = new ActionRateLimiter();
  constructor(private readonly store: AiPlatformStore, private readonly audit: AiAuditService, private readonly definitions: ActionDefinitionRegistry, private readonly executors: ActionExecutorRegistry, private readonly enabled = isAiPlatformCoreEnabled) { this.repo = new ActionRepository(store); }
  private async event(context: BusinessActionContext, id: number, eventType: any, decision: string, details: Record<string, unknown> = {}) { await this.audit.append({ tenantId: context.tenantId, traceId: context.traceId, actorType: context.actorType, actorId: context.actorId, eventType, entityType: 'business_action', entityId: String(id), decision, details: redactAiPlatformValue(details).value }); }
  private limit(context: BusinessActionContext, phone: string) { if (context.sourceChannel !== 'sandbox') return; this.limiter.consume(`tenant:${context.tenantId}`, 10, 3600000); if (context.conversationId) this.limiter.consume(`conversation:${context.tenantId}:${context.conversationId}`, 3, 600000); this.limiter.consume(`phone:${context.tenantId}:${tenantPhoneHash(context.tenantId, normalizePhone(phone))}`, 5, 600000); }
  async executeCallback(context: BusinessActionContext, raw: unknown): Promise<BusinessActionResult> {
    const definition = this.definitions.get('business.create_callback_request');
    const input = validateActionInput(definition.inputSchema, raw) as CallbackActionInput;
    const normalized = { ...input, phone: String(input.phone).trim(), reason: String(input.reason).trim() };
    const inputHash = this.repo.hash(normalized);
    if (context.idempotencyKey && !/^[A-Za-z0-9_.:-]{8,128}$/.test(context.idempotencyKey)) throw new BusinessActionError('invalid_request', 400, 'Invalid idempotency key');
    if (!(await this.enabled())) throw new BusinessActionError('feature_disabled', 503, 'AI Platform Core is disabled');
    const assignment = await this.store.query(`SELECT d.id,v.config_json FROM ai_agent_versions v JOIN ai_agent_actions aa ON aa.agent_version_id=v.id AND aa.tenant_id=v.tenant_id AND aa.enabled=1 JOIN ai_action_definitions d ON d.id=aa.action_definition_id AND d.enabled=1 WHERE v.id=? AND v.agent_id=? AND v.tenant_id=? AND d.action_key=? AND d.version=? LIMIT 1`, [context.agentVersionId, context.agentId, context.tenantId, definition.key, definition.version]);
    if (!assignment[0]) throw new BusinessActionError('permission_denied', 403, 'Business action is not assigned');
    let config: any = {}; try { config = JSON.parse(String(assignment[0].config_json || '{}')); } catch {}
    enforceActionPolicy(definition, context, config.autonomyLevel || 'SAFE'); this.limit(context, normalized.phone);
    if (context.idempotencyKey) {
      const row = (await this.repo.findReplay(context.tenantId, context.idempotencyKey))[0];
      if (row) { if (row.input_hash !== inputHash || row.action_key !== definition.key) throw new BusinessActionError('conflict', 409, 'Idempotency conflict'); if (row.status === 'completed') { const output = JSON.parse(String(row.output_json || '{}')); return { id: Number(row.id), status: 'completed', ok: true, callbackRequestId: Number(output.callbackRequestId), safeSummary: String(row.safe_summary), duplicate: true, errorCode: null }; } }
    }
    const actionId = await this.repo.create(context, Number(assignment[0].id), redactAiPlatformValue({ ...normalized, phone: '[PROTECTED]' }).value, inputHash);
    await this.event(context, actionId, 'business_action_requested', 'requested', { actionKey: definition.key });
    try {
      await this.repo.update(actionId, 'approved'); await this.event(context, actionId, 'business_action_approved', 'approved');
      await this.repo.update(actionId, 'running'); await this.event(context, actionId, 'business_action_started', 'started');
      const controller = new AbortController(), sourceSignal = (context as any).signal as AbortSignal | undefined, cancel = () => controller.abort(); sourceSignal?.addEventListener('abort', cancel, { once: true }); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const output = await Promise.race([this.executors.get(definition.executorKey).execute({ ...context, actionId, signal: controller.signal }, normalized), new Promise<never>((_, reject) => timer = setTimeout(() => { controller.abort(); reject(new BusinessActionError('action_timeout', 504, 'Business action timed out')); }, definition.timeoutMs))]);
        validateActionOutput(definition.outputSchema, output); await this.repo.update(actionId, 'completed', { output, summary: output.safeSummary });
        await this.event(context, actionId, 'business_action_completed', 'completed', { actionKey: definition.key, callbackRequestId: output.callbackRequestId, duplicate: output.duplicate });
        await this.event(context, actionId, output.duplicate ? 'callback_duplicate_suppressed' : 'callback_request_created', output.duplicate ? 'duplicate' : 'created', { callbackRequestId: output.callbackRequestId });
        return { id: actionId, status: 'completed', ok: true, callbackRequestId: output.callbackRequestId, safeSummary: output.safeSummary, duplicate: output.duplicate, errorCode: null };
      } finally { if (timer) clearTimeout(timer); sourceSignal?.removeEventListener('abort', cancel); }
    } catch (error) {
      const timed = error instanceof BusinessActionError && error.code === 'action_timeout', code = timed ? 'action_timeout' : error instanceof BusinessActionError ? error.code : 'action_failed';
      await this.repo.update(actionId, timed ? 'timed_out' : 'failed', { errorCode: code }); await this.event(context, actionId, 'business_action_failed', 'failed', { errorCode: code });
      return { id: actionId, status: timed ? 'timed_out' : 'failed', ok: false, callbackRequestId: null, safeSummary: 'Не удалось сохранить просьбу о звонке', duplicate: false, errorCode: code };
    }
  }
}
