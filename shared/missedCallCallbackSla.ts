export const DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES = 1440;
export const MAX_MISSED_CALL_CALLBACK_SLA_MINUTES = 10080;

function clampMinutes(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_MISSED_CALL_CALLBACK_SLA_MINUTES, Math.round(parsed)));
}

export function resolveMissedCallCallbackSlaMinutes(settings: any): number {
  if (settings?.missedCallCallbackSlaMinutes !== undefined) {
    return clampMinutes(settings.missedCallCallbackSlaMinutes, DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES);
  }
  if (settings?.missedCallCallbackSlaHours !== undefined) {
    const hours = Number(settings.missedCallCallbackSlaHours);
    if (Number.isFinite(hours)) return clampMinutes(hours * 60, DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES);
  }
  return DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES;
}
