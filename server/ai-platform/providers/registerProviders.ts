import type { LegacyGenerate } from './compatibilityAdapter.js';
import { LegacyProviderCompatibilityAdapter } from './compatibilityAdapter.js';
import { OpenAIHttpAdapter } from './httpAdapters.js';
import { getAIProviderRegistry } from './providerRegistry.js';

let registered = false;
export function registerStageOneProviders(legacyComplete: LegacyGenerate) {
  const registry = getAIProviderRegistry();
  if (registered) return registry;
  registry.register(new OpenAIHttpAdapter('openai'));
  registry.register(new OpenAIHttpAdapter('openai_compatible', true));
  for (const key of ['gemini', 'anthropic', 'deepseek']) registry.register(new LegacyProviderCompatibilityAdapter(key, legacyComplete));
  registered = true;
  return registry;
}
