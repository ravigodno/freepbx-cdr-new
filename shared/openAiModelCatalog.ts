export const OPENAI_TEXT_MODELS = [
  "gpt-6-astra",
  "gpt-5.6",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
] as const;

export const OPENAI_DEFAULT_TEXT_MODEL = "gpt-5.6-terra";

export const OPENAI_REALTIME_MODELS = [
  "gpt-realtime-2.1",
  "gpt-realtime-2.1-mini",
  "gpt-realtime-2",
  "gpt-realtime-1.5",
] as const;

export const OPENAI_DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";

export function usesOpenAIReasoningParameters(model: string): boolean {
  return /^gpt-(?:5(?:\.|-|$)|6(?:\.|-|$))/i.test(String(model || ""));
}
