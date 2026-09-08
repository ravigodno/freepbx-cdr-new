import fetch from 'node-fetch';
import https from 'node:https';
import { AiPlatformError } from '../core/errors.js';
import type { ProviderRequest, ProviderResponse } from '../core/contracts.js';
import type { AIProviderAdapter, ProviderConfig, ProviderHealth } from './providerAdapter.js';
import { TEXT_ONLY_CAPABILITIES } from './providerAdapter.js';

const DEFAULT_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';
const completionAgent=new https.Agent({keepAlive:true,maxSockets:16,maxFreeSockets:4,timeout:10000});

export class YandexGptAdapter implements AIProviderAdapter {
  getKey() { return 'yandex'; }
  getCapabilities() { return { ...TEXT_ONLY_CAPABILITIES, structuredToolRequest:true, structuredOutput:true }; }
  validateConfig(config: ProviderConfig) {
    const folderId = String(config.options?.folderId || '').trim();
    const errors = [...(!config.model ? ['model is required'] : []), ...(!config.secret ? ['provider secret is not configured'] : []), ...(!folderId ? ['folderId is required'] : [])];
    return { valid: errors.length === 0, errors };
  }
  async healthCheck(config: ProviderConfig): Promise<ProviderHealth> {
    const validation = this.validateConfig(config);
    return validation.valid ? { ok: true, status: 'ready', safeMessage: 'Yandex Cloud configuration is ready' } : { ok: false, status: 'not_configured', safeMessage: validation.errors.join('; ') };
  }
  async generate(request: ProviderRequest, config: ProviderConfig): Promise<ProviderResponse> {
    const validation = this.validateConfig(config);
    if (!validation.valid) throw new AiPlatformError('provider_not_configured', 503, validation.errors.join('; '));
    const controller = new AbortController(), cancel = () => controller.abort();
    request.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, Math.max(100, Math.min(request.timeoutMs, 120_000))), started = Date.now();
    try {
      const folderId = String(config.options?.folderId), model = request.model || config.model;
      const response = await fetch(String(config.baseUrl || DEFAULT_URL), { method: 'POST', signal: controller.signal as any,
        agent:String(config.baseUrl||DEFAULT_URL).startsWith('https:')?completionAgent:undefined,
        headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${config.secret}` },
        body: JSON.stringify({ modelUri: model.includes('://') ? model : `gpt://${folderId}/${model}/latest`, ...(request.responseSchema?{jsonSchema:{schema:request.responseSchema}}:request.responseFormat==='json'?{jsonObject:true}:{}), completionOptions: { stream: false, temperature: request.temperature, maxTokens: String(request.maxOutput) }, messages: request.messages.filter(item => item.role !== 'tool').map(item => ({ role: item.role, text: item.content })) }) });
      const data: any = await response.json().catch(() => null);
      if (!response.ok) throw new AiPlatformError('internal_error', 502, `YandexGPT returned HTTP ${response.status}`);
      const usage = data?.result?.usage || {}, alternative = data?.result?.alternatives?.[0] || {};
      return { content: String(alternative?.message?.text || ''), provider: 'yandex', model, finishReason: alternative?.status ? String(alternative.status) : null,
        usage: { inputTokens: Number(usage.inputTextTokens) || null, outputTokens: Number(usage.completionTokens) || null, totalTokens: Number(usage.totalTokens) || null }, latencyMs: Date.now() - started, providerRequestId: null };
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new AiPlatformError('internal_error', 504, 'YandexGPT request timed out');
      throw error;
    } finally { clearTimeout(timer); request.signal?.removeEventListener('abort', cancel); }
  }
}
