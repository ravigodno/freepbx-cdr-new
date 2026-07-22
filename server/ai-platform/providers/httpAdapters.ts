import fetch from 'node-fetch';
import { AiPlatformError } from '../core/errors.js';
import type { ProviderRequest, ProviderResponse } from '../core/contracts.js';
import type { AIProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderConfigValidation, ProviderHealth } from './providerAdapter.js';
import { TEXT_ONLY_CAPABILITIES } from './providerAdapter.js';

function endpoint(baseUrl: string | null | undefined, fallback: string): string {
  const value = String(baseUrl || fallback).replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(value)) return value;
  if (/\/v1$/i.test(value)) return `${value}/chat/completions`;
  return `${value}/v1/chat/completions`;
}

function validate(config: ProviderConfig, requireBaseUrl = false): ProviderConfigValidation {
  const errors: string[] = [];
  if (!config.model) errors.push('model is required');
  if (!config.secret) errors.push('provider secret is not configured');
  if (requireBaseUrl && !config.baseUrl) errors.push('baseUrl is required');
  return { valid: errors.length === 0, errors };
}

async function requestJson(url: string, init: any, timeoutMs: number): Promise<{ data: any; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(100, Math.min(timeoutMs, 120_000)));
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal as any });
    const text = await response.text();
    if (!response.ok) throw new AiPlatformError('internal_error', 502, `AI provider returned HTTP ${response.status}`);
    try { return { data: JSON.parse(text), latencyMs: Date.now() - started }; }
    catch { throw new AiPlatformError('internal_error', 502, 'AI provider returned invalid JSON'); }
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new AiPlatformError('internal_error', 504, 'AI provider request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}

export class OpenAIHttpAdapter implements AIProviderAdapter {
  constructor(private readonly key = 'openai', private readonly requireBaseUrl = false) {}
  getKey() { return this.key; }
  getCapabilities(): ProviderCapabilities { return { ...TEXT_ONLY_CAPABILITIES }; }
  validateConfig(config: ProviderConfig) { return validate(config, this.requireBaseUrl); }
  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const result = this.validateConfig(config);
    return result.valid ? { ok: true, status: 'ready', safeMessage: 'Provider configuration is ready' } : { ok: false, status: 'not_configured', safeMessage: result.errors.join('; ') };
  }
  async generate(request: ProviderRequest, config: ProviderConfig): Promise<ProviderResponse> {
    const validation = this.validateConfig(config);
    if (!validation.valid) throw new AiPlatformError('provider_not_configured', 503, validation.errors.join('; '));
    const result = await requestJson(endpoint(config.baseUrl, 'https://api.openai.com/v1'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({ model: request.model || config.model, temperature: request.temperature, max_tokens: request.maxOutput,
        messages: request.messages, ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}) })
    }, request.timeoutMs);
    const usage = result.data?.usage || {};
    return { content: String(result.data?.choices?.[0]?.message?.content || ''), provider: this.key, model: String(result.data?.model || request.model || config.model),
      finishReason: result.data?.choices?.[0]?.finish_reason || null, usage: { inputTokens: usage.prompt_tokens ?? null, outputTokens: usage.completion_tokens ?? null, totalTokens: usage.total_tokens ?? null },
      latencyMs: result.latencyMs, providerRequestId: result.data?.id ? String(result.data.id) : null };
  }
}
