export interface SafeVoiceUsage {
  total_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  audio_tokens: number | null;
  text_tokens: number | null;
  cached_tokens: number | null;
  transcription_tokens: number | null;
  input_audio_seconds: number | null;
  output_audio_seconds: number | null;
  estimated_cost: number | null;
  currency: string | null;
  pricing_snapshot_version: string | null;
  calculated_at: string | null;
  breakdown: Record<string, number> | null;
  transcription_model: string | null;
}

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const nested = (source: any, ...paths: string[][]) => {
  for (const path of paths) {
    let current = source;
    for (const key of path) current = current?.[key];
    const value = numeric(current);
    if (value !== null) return value;
  }
  return null;
};

export function projectSafeVoiceUsage(
  raw: unknown,
  audio?: { inputSeconds?: number; outputSeconds?: number },
): SafeVoiceUsage {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as any : {};
  const inputAudioTokens = nested(source, ["input_token_details", "audio_tokens"], ["input_tokens_details", "audio_tokens"]);
  const outputAudioTokens = nested(source, ["output_token_details", "audio_tokens"], ["output_tokens_details", "audio_tokens"]);
  const inputTextTokens = nested(source, ["input_token_details", "text_tokens"], ["input_tokens_details", "text_tokens"]);
  const outputTextTokens = nested(source, ["output_token_details", "text_tokens"], ["output_tokens_details", "text_tokens"]);
  return {
    total_tokens: numeric(source.total_tokens),
    input_tokens: numeric(source.input_tokens),
    output_tokens: numeric(source.output_tokens),
    audio_tokens: [inputAudioTokens, outputAudioTokens].some(value => value !== null)
      ? (inputAudioTokens || 0) + (outputAudioTokens || 0) : numeric(source.audio_tokens),
    text_tokens: [inputTextTokens, outputTextTokens].some(value => value !== null)
      ? (inputTextTokens || 0) + (outputTextTokens || 0) : numeric(source.text_tokens),
    cached_tokens: nested(source, ["input_token_details", "cached_tokens"], ["input_tokens_details", "cached_tokens"], ["cached_tokens"]),
    transcription_tokens: nested(source, ["input_token_details", "transcription_tokens"], ["transcription_tokens"]),
    input_audio_seconds: numeric(audio?.inputSeconds),
    output_audio_seconds: numeric(audio?.outputSeconds),
    estimated_cost: null,
    currency: null,
    pricing_snapshot_version: null,
    calculated_at: null,
    breakdown: null,
    transcription_model: typeof source.transcription_model === "string"
      ? source.transcription_model.slice(0, 100) : null,
  };
}

export function estimateVoiceCost(
  usage: SafeVoiceUsage,
  pricing: { version: string; currency: string; rates: Partial<Record<"audio"|"text"|"transcription", number>> } | null,
): SafeVoiceUsage {
  if (!pricing?.version) return usage;
  const breakdown: Record<string, number> = {};
  if (usage.audio_tokens !== null && pricing.rates.audio !== undefined)
    breakdown.audio = usage.audio_tokens * pricing.rates.audio;
  if (usage.text_tokens !== null && pricing.rates.text !== undefined)
    breakdown.text = usage.text_tokens * pricing.rates.text;
  if (usage.transcription_tokens !== null && pricing.rates.transcription !== undefined)
    breakdown.transcription = usage.transcription_tokens * pricing.rates.transcription;
  if (!Object.keys(breakdown).length) return usage;
  return {
    ...usage,
    estimated_cost: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
    currency: pricing.currency,
    pricing_snapshot_version: pricing.version,
    calculated_at: new Date().toISOString(),
    breakdown,
  };
}
