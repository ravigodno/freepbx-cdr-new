import { redactAiPlatformValue } from '../core/redaction.js';
import type { AgentActorType } from '../core/contracts.js';
import type { AiPlatformStore } from '../storage/aiPlatformStore.js';

export type AiAuditEventType = 'tenant_created'|'agent_created'|'agent_version_created'|'agent_version_published'|'agent_version_archived'|'provider_registered'|'provider_config_updated'|'tool_registered'|'permission_denied'|'feature_flag_blocked';
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
