import crypto from 'crypto';
import { redactAiPlatformValue } from '../core/redaction.js';
import { areAiWriteToolsEnabled, isAiPlatformCoreEnabled } from '../core/featureFlag.js';
import type { AiAuditEventType, AiAuditService } from '../audit/aiAuditService.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';
import type { ToolExecutionContext } from './toolExecutionContext.js';
import { ToolExecutionRepository } from './toolExecutionRepository.js';
import { enforceToolPolicy } from './toolPolicyEngine.js';
import { validateToolInput } from './toolInputValidator.js';
import { validateToolOutput } from './toolOutputValidator.js';
import { TOOL_SCHEMAS } from './toolSchemas.js';
import { ReadOnlyExecutorRegistry } from './executors/readOnlyExecutors.js';
import { ToolExecutionError } from './toolErrors.js';
import { InMemoryToolRateLimiter } from './toolRateLimiter.js';

export interface ToolExecutorOptions {
  isCoreEnabled?: () => Promise<boolean>;
  areWriteToolsEnabled?: () => Promise<boolean>;
  timeoutMs?: number;
  limiter?: InMemoryToolRateLimiter;
}

function stableJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

const parseStoredOutput = (value: string|null): unknown => { try { return value ? JSON.parse(value) : null; } catch { return null; } };

export class ToolExecutor {
  private readonly repository: ToolExecutionRepository;
  private readonly isCoreEnabled: () => Promise<boolean>;
  private readonly areWriteToolsEnabled: () => Promise<boolean>;
  private readonly timeoutMs: number;
  private readonly limiter: InMemoryToolRateLimiter;

  constructor(private readonly store: AiPlatformStore, private readonly audit: AiAuditService, private readonly executors: ReadOnlyExecutorRegistry, options: ToolExecutorOptions = {}) {
    this.repository = new ToolExecutionRepository(store);
    this.isCoreEnabled = options.isCoreEnabled || isAiPlatformCoreEnabled;
    this.areWriteToolsEnabled = options.areWriteToolsEnabled || areAiWriteToolsEnabled;
    this.timeoutMs = options.timeoutMs || 8000;
    this.limiter = options.limiter || new InMemoryToolRateLimiter();
  }

  private async emit(context: ToolExecutionContext, executionId: number, eventType: AiAuditEventType, decision: string, details: Record<string, unknown>): Promise<void> {
    try {
      await this.audit.append({ tenantId: context.tenantId, traceId: context.traceId, actorType: context.actorType, actorId: context.actorId,
        eventType, entityType: 'tool_execution', entityId: String(executionId), decision, details });
    } catch { /* Audit failure must not leave an execution in an intermediate state. */ }
  }

  private async deny(context: ToolExecutionContext, executionId: number, startedAt: number, errorCode: string, error: ToolExecutionError, eventType?: AiAuditEventType): Promise<never> {
    const duration = Date.now() - startedAt;
    await this.repository.finish(executionId, 'denied', null, errorCode, duration);
    if (eventType) await this.emit(context, executionId, eventType, 'denied', { toolKey: context.toolKey, errorCode });
    await this.emit(context, executionId, 'tool_execution_denied', 'denied', { toolKey: context.toolKey, errorCode, durationMs: duration });
    throw error;
  }

  async execute(context: ToolExecutionContext, input: unknown, externalSignal?: AbortSignal) {
    const startedAt = Date.now();
    const idempotencyKey = context.idempotencyKey?.trim() || null;
    if (idempotencyKey && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(idempotencyKey))
      throw new ToolExecutionError('invalid_request', 400, 'Invalid idempotency key');
    const toolRows = await this.store.query(`SELECT id,tool_key,executor_key,risk_level,enabled FROM ai_tools
      WHERE id=? AND (tenant_id=? OR tenant_id IS NULL) LIMIT 1`, [context.toolId, context.tenantId]);
    const tool = toolRows[0];
    if (!tool) throw new ToolExecutionError('not_found', 404, 'Tool not found');
    if (context.toolKey !== tool.tool_key) throw new ToolExecutionError('permission_denied', 403, 'Tool identity mismatch');

    const inputHash = crypto.createHash('sha256').update(stableJson(input)).digest('hex');
    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(context.tenantId, idempotencyKey);
      if (existing) {
        if (existing.agent_version_id !== context.agentVersionId || existing.tool_id !== context.toolId || existing.input_hash !== inputHash)
          throw new ToolExecutionError('conflict', 409, 'Idempotency key conflict');
        if (existing.status !== 'completed') throw new ToolExecutionError('conflict', 409, 'Previous idempotent execution is not reusable');
        return { id: existing.id, ok: true, data: parseStoredOutput(existing.output_json), durationMs: Number(existing.duration_ms || 0), replayed: true };
      }
    }

    const redactedInput = redactAiPlatformValue(input).value;
    let executionId: number;
    try {
      executionId = await this.repository.createRequested({ tenantId: context.tenantId, traceId: context.traceId.slice(0, 64),
        conversationId: context.conversationId, agentId: context.agentId, agentVersionId: context.agentVersionId, toolId: tool.id,
        toolKey: tool.tool_key, executorKey: tool.executor_key, riskLevel: tool.risk_level, inputJson: stableJson(redactedInput), inputHash,
        actorId: context.actorId, idempotencyKey });
    } catch (error: any) {
      if (idempotencyKey && String(error?.code) === 'ER_DUP_ENTRY') {
        const existing = await this.repository.findByIdempotencyKey(context.tenantId, idempotencyKey);
        if (existing && existing.agent_version_id === context.agentVersionId && existing.tool_id === context.toolId && existing.input_hash === inputHash && existing.status === 'completed')
          return { id: existing.id, ok: true, data: parseStoredOutput(existing.output_json), durationMs: Number(existing.duration_ms || 0), replayed: true };
        throw new ToolExecutionError('conflict', 409, 'Idempotency key conflict');
      }
      throw new ToolExecutionError('internal_error', 500, 'Unable to create tool execution');
    }
    await this.emit(context, executionId, 'tool_execution_requested', 'requested', { toolKey: tool.tool_key, riskLevel: tool.risk_level });

    if (!(await this.isCoreEnabled())) return this.deny(context, executionId, startedAt, 'feature_disabled',
      new ToolExecutionError('feature_disabled', 503, 'AI Platform Core is disabled'), 'feature_flag_blocked');
    await this.areWriteToolsEnabled(); // Read for an explicit service boundary; Stage 5A remains read-only regardless of its value.
    const assignments = await this.store.query(`SELECT at.enabled FROM ai_agent_tools at JOIN ai_agent_versions av
      ON av.id=at.agent_version_id AND av.tenant_id=at.tenant_id AND av.agent_id=?
      WHERE at.tenant_id=? AND at.agent_version_id=? AND at.tool_id=? LIMIT 1`,
    [context.agentId, context.tenantId, context.agentVersionId, context.toolId]);
    if (!assignments.length) return this.deny(context, executionId, startedAt, 'tool_not_assigned', new ToolExecutionError('permission_denied', 403, 'Tool is not assigned'));
    try { enforceToolPolicy({ risk: tool.risk_level, enabled: Boolean(tool.enabled && assignments[0].enabled), assigned: true, permissions: context.permissions }); }
    catch (error) { return this.deny(context, executionId, startedAt, tool.risk_level === 'read' ? 'permission_denied' : 'write_tools_disabled',
      error instanceof ToolExecutionError ? error : new ToolExecutionError('permission_denied', 403, 'Tool denied')) }
    if (!this.executors.has(tool.executor_key)) return this.deny(context, executionId, startedAt, 'unknown_executor', new ToolExecutionError('invalid_request', 400, 'Tool executor unavailable'));
    const schemas = TOOL_SCHEMAS[tool.tool_key];
    if (!schemas) return this.deny(context, executionId, startedAt, 'unknown_tool_schema', new ToolExecutionError('invalid_request', 400, 'Unsupported tool definition'));
    let validatedInput: any;
    try { validatedInput = validateToolInput(schemas.input, input); }
    catch (error) { return this.deny(context, executionId, startedAt, 'invalid_tool_input', error as ToolExecutionError, 'invalid_tool_input'); }
    try { this.limiter.consume(context.tenantId, context.actorId); }
    catch (error) { return this.deny(context, executionId, startedAt, 'rate_limited', error as ToolExecutionError); }
    let release: () => void;
    try { release = this.limiter.acquireConversation(context.tenantId, context.conversationId); }
    catch (error) { return this.deny(context, executionId, startedAt, 'concurrency_limited', error as ToolExecutionError); }

    if (externalSignal?.aborted) { release(); await this.repository.finish(executionId, 'cancelled', null, 'tool_cancelled', Date.now() - startedAt);
      await this.emit(context, executionId, 'tool_execution_cancelled', 'cancelled', { toolKey: tool.tool_key, errorCode: 'tool_cancelled' });
      throw new ToolExecutionError('conflict', 409, 'Tool execution cancelled'); }
    await this.repository.markRunning(executionId);
    await this.emit(context, executionId, 'tool_execution_started', 'running', { toolKey: tool.tool_key });
    const controller = new AbortController();
    let timeoutTriggered = false;
    const cancel = () => controller.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { timeoutTriggered = true; controller.abort(); reject(new Error('timeout')); }, this.timeoutMs); });
      const cancelled = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error(timeoutTriggered ? 'timeout' : 'cancelled')), { once: true }));
      let output: unknown;
      try { output = await Promise.race([this.executors.get(tool.executor_key)(validatedInput, controller.signal), timeout, cancelled]); }
      finally { if (timer) clearTimeout(timer); }
      let safeOutput: unknown;
      try { safeOutput = redactAiPlatformValue(validateToolOutput(schemas.output, output)).value; }
      catch { const duration = Date.now() - startedAt; await this.repository.finish(executionId, 'failed', null, 'invalid_tool_output', duration);
        await this.emit(context, executionId, 'invalid_tool_output', 'failed', { toolKey: tool.tool_key, errorCode: 'invalid_tool_output' });
        await this.emit(context, executionId, 'tool_execution_failed', 'failed', { toolKey: tool.tool_key, errorCode: 'invalid_tool_output', durationMs: duration });
        throw new ToolExecutionError('internal_error', 502, 'Tool returned an invalid response'); }
      const duration = Date.now() - startedAt;
      await this.repository.finish(executionId, 'completed', stableJson(safeOutput), null, duration);
      await this.emit(context, executionId, 'tool_execution_completed', 'completed', { toolKey: tool.tool_key, durationMs: duration });
      return { id: executionId, ok: true, data: safeOutput, durationMs: duration, replayed: false };
    } catch (error) {
      if (error instanceof ToolExecutionError && error.message === 'Tool returned an invalid response') throw error;
      const duration = Date.now() - startedAt;
      if (timeoutTriggered) { await this.repository.finish(executionId, 'timed_out', null, 'tool_timeout', duration);
        await this.emit(context, executionId, 'tool_execution_timeout', 'timed_out', { toolKey: tool.tool_key, errorCode: 'tool_timeout', durationMs: duration });
        throw new ToolExecutionError('internal_error', 504, 'Tool timed out'); }
      if (externalSignal?.aborted || controller.signal.aborted) { await this.repository.finish(executionId, 'cancelled', null, 'tool_cancelled', duration);
        await this.emit(context, executionId, 'tool_execution_cancelled', 'cancelled', { toolKey: tool.tool_key, errorCode: 'tool_cancelled', durationMs: duration });
        throw new ToolExecutionError('conflict', 409, 'Tool execution cancelled'); }
      await this.repository.finish(executionId, 'failed', null, 'tool_failed', duration);
      await this.emit(context, executionId, 'tool_execution_failed', 'failed', { toolKey: tool.tool_key, errorCode: 'tool_failed', durationMs: duration });
      throw new ToolExecutionError('internal_error', 502, 'Tool execution failed');
    } finally {
      externalSignal?.removeEventListener('abort', cancel); release();
    }
  }
}
