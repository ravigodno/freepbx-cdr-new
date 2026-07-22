import crypto from 'crypto';
import type { AgentRunContext, AgentActorType, AgentChannel } from './contracts.js';

export function createAgentRunContext(input: {
  tenantId:number; installationId:string; actorType?:AgentActorType; actorId?:string|null; channel?:AgentChannel;
  locale?:string; agentId?:number|null; agentVersionId?:number|null; conversationId?:string|null; permissions?:string[]; traceId?:string;
}): AgentRunContext {
  return { traceId: input.traceId || crypto.randomUUID(), tenantId: input.tenantId, installationId: input.installationId,
    actorType: input.actorType || 'user', actorId: input.actorId || null, channel: input.channel || 'api', locale: input.locale || 'ru',
    agentId: input.agentId || null, agentVersionId: input.agentVersionId || null, conversationId: input.conversationId || null,
    permissions: Object.freeze([...(input.permissions || [])]), requestStartedAt: new Date().toISOString() };
}
