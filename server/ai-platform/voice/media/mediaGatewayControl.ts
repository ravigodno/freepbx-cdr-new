import type { AiPlatformStore } from '../../storage/aiPlatformStore.js';

export async function readVoiceMediaSettings(store: AiPlatformStore) {
  const rows = await store.query("SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.voice_media_transport_enabled','ai.voice_media_transport_mode')");
  const values = new Map(rows.map(row => [String(row.setting_key), String(row.setting_value)]));
  const configured = String(values.get('ai.voice_media_transport_mode') || 'synthetic');
  return {
    enabled: values.get('ai.voice_media_transport_enabled') === 'true',
    mode: (['synthetic', 'external_media', 'audiosocket'].includes(configured) ? configured : 'synthetic') as 'synthetic' | 'external_media' | 'audiosocket'
  };
}
