import type { AiPlatformStore } from '../../storage/aiPlatformStore.js';

export async function readRealtimeVoiceSettings(store: AiPlatformStore) {
  const rows = await store.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.realtime_voice_enabled','ai.realtime_voice_provider')");
  const values = new Map(rows.map((row: any) => [String(row.setting_key), String(row.setting_value)]));
  const provider = values.get('ai.realtime_voice_provider') || 'synthetic';
  return { enabled: values.get('ai.realtime_voice_enabled') === 'true', provider: ['synthetic', 'openai_realtime'].includes(provider) ? provider : 'synthetic' };
}
