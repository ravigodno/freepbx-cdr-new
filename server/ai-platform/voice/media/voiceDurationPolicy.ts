import type { AiPlatformStore } from "../../storage/aiPlatformStore.js";

export interface VoiceDurationPolicy {
  maxCallDurationSeconds: number;
  warningThresholdSeconds: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.floor(value)));

export async function readVoiceDurationPolicy(
  store: AiPlatformStore,
): Promise<VoiceDurationPolicy> {
  const rows = await store.query(
    "SELECT setting_key,setting_value FROM settings WHERE setting_key IN('ai.voice_max_call_duration_seconds','ai.voice_duration_warning_seconds')",
  );
  const settings = new Map(
    rows.map((row: any) => [String(row.setting_key), Number(row.setting_value)]),
  );
  const maxCallDurationSeconds = clamp(
    settings.get("ai.voice_max_call_duration_seconds") || 1800,
    60,
    7200,
  );
  return {
    maxCallDurationSeconds,
    warningThresholdSeconds: clamp(
      settings.get("ai.voice_duration_warning_seconds") || 60,
      0,
      Math.max(0, maxCallDurationSeconds - 1),
    ),
  };
}

