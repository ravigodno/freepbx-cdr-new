import type { ProviderRequest, ProviderResponse } from '../core/contracts.js';
import type { AIProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderConfigValidation, ProviderHealth } from './providerAdapter.js';
import { TEXT_ONLY_CAPABILITIES } from './providerAdapter.js';

export type LegacyGenerate = (params: {
  provider: string; model: string; temperature: number; systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; text: string }>;
  responseType?: 'json' | 'text'; apiKey?: string; baseUrl?: string; signal?: AbortSignal;
}) => Promise<string>;

export class LegacyProviderCompatibilityAdapter implements AIProviderAdapter {
  constructor(private readonly key: string, private readonly complete: LegacyGenerate) {}
  getKey() { return this.key; }
  getCapabilities(): ProviderCapabilities { return { ...TEXT_ONLY_CAPABILITIES }; }
  validateConfig(config: ProviderConfig): ProviderConfigValidation {
    const errors = [...(!config.model ? ['model is required'] : []), ...(!config.secret ? ['provider secret is not configured'] : [])];
    return { valid: errors.length === 0, errors };
  }
  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const result = this.validateConfig(config);
    return result.valid ? { ok: true, status: 'ready', safeMessage: 'Legacy compatibility configuration is ready' } : { ok: false, status: 'not_configured', safeMessage: result.errors.join('; ') };
  }
  async generate(request: ProviderRequest, config: ProviderConfig): Promise<ProviderResponse> {
    const started = Date.now();
    const system = request.messages.find(message => message.role === 'system')?.content || '';
    const content = await this.complete({ provider: this.key, model: request.model || config.model, temperature: request.temperature, systemPrompt: system,
      messages: request.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => ({ role: message.role as 'user' | 'assistant', text: message.content })),
      responseType: request.responseFormat, apiKey: config.secret || undefined, baseUrl: config.baseUrl || undefined });
    return { content, provider: this.key, model: request.model || config.model, finishReason: null,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null }, latencyMs: Date.now() - started, providerRequestId: null };
  }
}
