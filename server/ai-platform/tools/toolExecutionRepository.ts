import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export type ToolExecutionStatus = 'requested'|'denied'|'running'|'completed'|'failed'|'timed_out'|'cancelled';

export interface RequestedExecution {
  tenantId: number; traceId: string; conversationId: number|null; agentId: number; agentVersionId: number;
  toolId: number; toolKey: string; executorKey: string; riskLevel: string; inputJson: string; inputHash: string;
  actorId: string|null; idempotencyKey: string|null;
}

export interface StoredExecution {
  id: number; tenant_id: number; agent_version_id: number; tool_id: number; tool_key: string; status: ToolExecutionStatus;
  input_hash: string; output_json: string|null; error_code: string|null; duration_ms: number|null;
}

export class ToolExecutionRepository {
  constructor(readonly store: AiPlatformStore) {}

  async findByIdempotencyKey(tenantId: number, key: string): Promise<StoredExecution|null> {
    const rows = await this.store.query(`SELECT id,tenant_id,agent_version_id,tool_id,tool_key,status,input_hash,output_json,error_code,duration_ms
      FROM ai_tool_executions WHERE tenant_id=? AND idempotency_key=? LIMIT 1`, [tenantId, key]);
    return rows[0] || null;
  }

  async createRequested(value: RequestedExecution): Promise<number> {
    const result: any = await this.store.query(`INSERT INTO ai_tool_executions
      (tenant_id,trace_id,conversation_id,agent_id,agent_version_id,tool_id,tool_key,executor_key,status,risk_level,input_json,input_hash,actor_id,idempotency_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [value.tenantId,value.traceId,value.conversationId,value.agentId,value.agentVersionId,value.toolId,
      value.toolKey,value.executorKey,'requested',value.riskLevel,value.inputJson,value.inputHash,value.actorId,value.idempotencyKey]);
    return Number(result.insertId);
  }

  async markRunning(id: number): Promise<void> {
    await this.store.query("UPDATE ai_tool_executions SET status='running' WHERE id=? AND status='requested'", [id]);
  }

  async finish(id: number, status: Exclude<ToolExecutionStatus,'requested'|'running'>, outputJson: string|null, errorCode: string|null, durationMs: number): Promise<void> {
    await this.store.query(`UPDATE ai_tool_executions SET status=?,output_json=?,error_code=?,duration_ms=?,completed_at=NOW()
      WHERE id=? AND status IN ('requested','running')`, [status, outputJson, errorCode, durationMs, id]);
  }
}
