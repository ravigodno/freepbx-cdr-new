import type { ProviderConfig } from './providerAdapter.js';

export interface LegacyProviderConfigState { config: ProviderConfig; source: 'legacy_read_only'; configured: boolean }

export function readLegacyProviderConfig(legacyDb: any): LegacyProviderConfigState {
  const settings = legacyDb?.ai_pbx_settings || {};
  const providerKey = String(settings.provider || 'gemini').toLowerCase();
  return { source:'legacy_read_only', configured:Boolean(settings.apiKey), config:{ providerKey, model:String(settings.model||''),
    baseUrl:settings.baseUrl?String(settings.baseUrl):null, secret:settings.apiKey?String(settings.apiKey):null,
    options:{temperature:Number(settings.temperature??0.2)} } };
}

export function publicLegacyProviderConfig(state: LegacyProviderConfigState) {
  return { providerKey:state.config.providerKey, model:state.config.model, baseUrlConfigured:Boolean(state.config.baseUrl),
    secretConfigured:Boolean(state.config.secret), configured:state.configured, source:state.source };
}
