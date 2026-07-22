import type { ProviderRequest, ProviderResponse } from '../core/contracts.js';

export interface ProviderCapabilities {
  text: boolean;
  streaming: boolean;
  nativeTools: boolean;
  realtimeVoice: boolean;
  structuredOutput: boolean;
  structuredToolRequest: boolean;
}

export interface ProviderConfig {
  providerKey: string;
  model: string;
  baseUrl?: string | null;
  secret?: string | null;
  options?: Record<string, unknown>;
}

export interface ProviderConfigValidation { valid: boolean; errors: string[] }
export interface ProviderHealth { ok: boolean; status: 'ready' | 'not_configured' | 'unavailable'; safeMessage: string }

export interface AIProviderAdapter {
  getKey(): string;
  getCapabilities(): ProviderCapabilities;
  validateConfig(config: ProviderConfig): ProviderConfigValidation;
  generate(request: ProviderRequest, config: ProviderConfig): Promise<ProviderResponse>;
  healthCheck(config: ProviderConfig): Promise<ProviderHealth>;
}

export const TEXT_ONLY_CAPABILITIES: ProviderCapabilities = {
  text: true,
  streaming: false,
  nativeTools: false,
  realtimeVoice: false,
  structuredOutput: true,
  structuredToolRequest: false
};
