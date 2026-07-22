import { AiPlatformError } from '../core/errors.js';
import type { AIProviderAdapter, ProviderCapabilities } from './providerAdapter.js';

export class AIProviderRegistry {
  private readonly adapters = new Map<string, AIProviderAdapter>();
  register(adapter: AIProviderAdapter): void {
    const key = adapter.getKey();
    if (!/^[a-z0-9_-]{2,64}$/.test(key)) throw new Error('Invalid provider key');
    this.adapters.set(key, adapter);
  }
  get(key: string): AIProviderAdapter {
    const adapter = this.adapters.get(String(key || '').toLowerCase());
    if (!adapter) throw new AiPlatformError('provider_unknown', 404, 'Unknown AI provider');
    return adapter;
  }
  list(): Array<{ key: string; capabilities: ProviderCapabilities }> {
    return Array.from(this.adapters.values()).map(adapter => ({ key: adapter.getKey(), capabilities: adapter.getCapabilities() }));
  }
}

let singleton: AIProviderRegistry | null = null;
export function getAIProviderRegistry(): AIProviderRegistry {
  if (!singleton) singleton = new AIProviderRegistry();
  return singleton;
}
