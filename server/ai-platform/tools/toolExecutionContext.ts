import type { AgentActorType } from '../core/contracts.js';

export interface ToolExecutionContext {
  traceId: string;
  tenantId: number;
  installationId: string;
  actorId: string|null;
  actorType: AgentActorType;
  agentId: number;
  agentVersionId: number;
  conversationId: number|null;
  toolId: number;
  toolKey: string;
  permissions: readonly string[];
  locale: string;
  requestStartedAt: string;
  idempotencyKey: string|null;
}
