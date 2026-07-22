export type AgentActorType = 'user' | 'system' | 'service';
export type AgentChannel = 'api' | 'chat' | 'voice' | 'test';

export interface AgentRunContext {
  traceId: string;
  tenantId: number;
  installationId: string;
  actorType: AgentActorType;
  actorId: string | null;
  channel: AgentChannel;
  locale: string;
  agentId: number | null;
  agentVersionId: number | null;
  conversationId: string | null;
  permissions: readonly string[];
  requestStartedAt: string;
}

export type AgentStatus = 'draft' | 'active' | 'archived';
export type AgentVersionStatus = 'draft' | 'published' | 'archived';

export interface AgentVersionDefinition {
  id: number;
  version: number;
  status: AgentVersionStatus;
  prompt: string;
  config: Record<string, unknown>;
  checksum: string | null;
}

export interface AgentDefinition {
  id: number;
  key: string;
  name: string;
  type: string;
  status: AgentStatus;
  currentVersion: AgentVersionDefinition | null;
}

export type ProviderMessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ProviderMessage { role: ProviderMessageRole; content: string }
export interface ProviderUsage { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }

export interface ProviderRequest {
  messages: ProviderMessage[];
  model: string;
  temperature: number;
  maxOutput: number;
  responseFormat: 'text' | 'json';
  traceId: string;
  timeoutMs: number;
}

export interface ProviderResponse {
  content: string;
  provider: string;
  model: string;
  finishReason: string | null;
  usage: ProviderUsage;
  latencyMs: number;
  providerRequestId: string | null;
}

export type ToolRiskLevel = 'read' | 'low_write' | 'high_write' | 'forbidden';
export type ToolExecutorStatus = 'registered' | 'unavailable' | 'disabled';

export interface ToolDefinition {
  key: string;
  version: number;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  executorKey: string;
  enabled: boolean;
  executorStatus: ToolExecutorStatus;
}

export interface ToolResult<T = unknown> {
  ok: boolean;
  data: T | null;
  errorCode: string | null;
  safeMessage: string | null;
  metadata: Record<string, unknown> | null;
}
