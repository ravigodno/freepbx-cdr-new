import { redactAiPlatformValue } from '../core/redaction.js';
import type { AgentActorType } from '../core/contracts.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export type AiAuditEventType = 'tenant_created'|'agent_created'|'agent_version_created'|'agent_version_published'|'agent_version_archived'|'provider_registered'|'provider_config_updated'|'tool_registered'|'permission_denied'|'feature_flag_blocked'|'template_created'|'template_used'|'agent_created_from_template'|'agent_cloned'|'behavior_profile_changed'|'transfer_policy_changed'|'autonomy_policy_changed'|'agent_validation_failed'|'agent_validation_passed'|'test_session_created'|'knowledge_source_created'|'knowledge_version_created'|'knowledge_version_published'|'knowledge_archived'|'training_item_created'|'training_version_created'|'training_version_published'|'context_preview_requested'|'validation_failed'|'sandbox_session_started'|'sandbox_message_received'|'provider_request_started'|'provider_request_completed'|'provider_request_failed'|'human_transfer_detected'|'response_validation_failed'|'sandbox_session_completed'|'sandbox_session_cancelled'|'tool_execution_requested'|'tool_execution_denied'|'tool_execution_started'|'tool_execution_completed'|'tool_execution_failed'|'tool_execution_timeout'|'tool_execution_cancelled'|'invalid_tool_input'|'invalid_tool_output'|'tool_loop_limit_reached';
export interface AiAuditEvent { tenantId: number; traceId: string; actorType: AgentActorType; actorId?: string|null; eventType: AiAuditEventType; entityType: string; entityId?: string|null; decision: string; details?: unknown }

export class AiAuditService {
  constructor(private readonly store: AiPlatformStore) {}
  async append(event: AiAuditEvent): Promise<void> {
    const redacted = redactAiPlatformValue(event.details ?? {});
    await this.store.query(`INSERT INTO ai_audit_log (tenant_id,trace_id,actor_type,actor_id,event_type,entity_type,entity_id,decision,details_json)
      VALUES (?,?,?,?,?,?,?,?,?)`, [event.tenantId, event.traceId.slice(0,64), event.actorType, event.actorId?.slice(0,191) || null,
      event.eventType, event.entityType.slice(0,100), event.entityId?.slice(0,100) || null, event.decision.slice(0,64), JSON.stringify(redacted.value)]);
  }
}
