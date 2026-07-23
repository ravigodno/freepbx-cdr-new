export const PERSONALITY_SCHEMA_VERSION = 1;

const LEVELS = ["low", "medium", "medium_high", "high", "very_high"] as const;
const enumValue = (value: unknown, allowed: readonly string[], fallback: string) =>
  allowed.includes(String(value)) ? String(value) : fallback;

export type AgentPersonalityProfile = {
  schemaVersion: 1;
  warmth: string;
  attentiveness: string;
  energy: string;
  empathy: string;
  formality: string;
  brevity: string;
  initiative: string;
  humor: string;
  patience: string;
  persistence: string;
  speakingStyle: string;
  selfDescription: string;
  responsePacing: string;
  speakingRate: string;
  pauseStyle: string;
  enthusiasm: string;
  emotionalDistance: string;
};

export const receptionistPersonalityV10 = (): AgentPersonalityProfile => ({
  schemaVersion: PERSONALITY_SCHEMA_VERSION,
  warmth: "high",
  attentiveness: "very_high",
  energy: "medium_high",
  empathy: "medium",
  formality: "medium",
  brevity: "high",
  initiative: "medium",
  humor: "low",
  patience: "very_high",
  persistence: "low",
  speakingStyle: "friendly_confident",
  selfDescription: "receptionist",
  responsePacing: "concise_natural",
  speakingRate: "slightly_fast",
  pauseStyle: "short_natural",
  enthusiasm: "warm",
  emotionalDistance: "low",
});

export function validatePersonalityProfile(value: unknown): string[] {
  if (value === undefined) return [];
  if (!value || typeof value !== "object") return ["personality_invalid"];
  const profile = value as Record<string, unknown>, errors: string[] = [];
  if (Number(profile.schemaVersion) !== PERSONALITY_SCHEMA_VERSION)
    errors.push("personality_schema_version_invalid");
  for (const key of [
    "warmth", "attentiveness", "energy", "empathy", "formality", "brevity",
    "initiative", "humor", "patience", "persistence",
  ])
    if (!LEVELS.includes(String(profile[key]) as any))
      errors.push(`personality_${key}_invalid`);
  const enums: Record<string, string[]> = {
    speakingStyle: ["friendly_confident", "calm_professional", "neutral"],
    selfDescription: ["receptionist", "assistant"],
    responsePacing: ["concise_natural", "measured"],
    speakingRate: ["normal", "slightly_fast"],
    pauseStyle: ["short_natural", "natural"],
    enthusiasm: ["neutral", "warm"],
    emotionalDistance: ["low", "medium"],
  };
  for (const [key, allowed] of Object.entries(enums))
    if (!allowed.includes(String(profile[key])))
      errors.push(`personality_${key}_invalid`);
  return errors;
}

export function normalizePersonalityProfile(value: unknown): AgentPersonalityProfile {
  const base = receptionistPersonalityV10();
  if (!value || typeof value !== "object") return base;
  const profile = value as Record<string, unknown>;
  return {
    ...base,
    schemaVersion: 1,
    warmth: enumValue(profile.warmth, LEVELS, base.warmth),
    attentiveness: enumValue(profile.attentiveness, LEVELS, base.attentiveness),
    energy: enumValue(profile.energy, LEVELS, base.energy),
    empathy: enumValue(profile.empathy, LEVELS, base.empathy),
    formality: enumValue(profile.formality, LEVELS, base.formality),
    brevity: enumValue(profile.brevity, LEVELS, base.brevity),
    initiative: enumValue(profile.initiative, LEVELS, base.initiative),
    humor: enumValue(profile.humor, LEVELS, base.humor),
    patience: enumValue(profile.patience, LEVELS, base.patience),
    persistence: enumValue(profile.persistence, LEVELS, base.persistence),
    speakingStyle: enumValue(profile.speakingStyle, ["friendly_confident", "calm_professional", "neutral"], base.speakingStyle),
    selfDescription: enumValue(profile.selfDescription, ["receptionist", "assistant"], base.selfDescription),
    responsePacing: enumValue(profile.responsePacing, ["concise_natural", "measured"], base.responsePacing),
    speakingRate: enumValue(profile.speakingRate, ["normal", "slightly_fast"], base.speakingRate),
    pauseStyle: enumValue(profile.pauseStyle, ["short_natural", "natural"], base.pauseStyle),
    enthusiasm: enumValue(profile.enthusiasm, ["neutral", "warm"], base.enthusiasm),
    emotionalDistance: enumValue(profile.emotionalDistance, ["low", "medium"], base.emotionalDistance),
  };
}

export function compilePersonalityInstructions(value: unknown) {
  const profile = normalizePersonalityProfile(value);
  return [
    "PERSONALITY PROFILE (internal, do not quote):",
    `warmth=${profile.warmth}; attentiveness=${profile.attentiveness}; energy=${profile.energy}; empathy=${profile.empathy}; formality=${profile.formality}; brevity=${profile.brevity}; initiative=${profile.initiative}; humor=${profile.humor}; patience=${profile.patience}; persistence=${profile.persistence}.`,
    `speaking_style=${profile.speakingStyle}; response_pacing=${profile.responsePacing}; speaking_rate=${profile.speakingRate}; pause_style=${profile.pauseStyle}; enthusiasm=${profile.enthusiasm}; emotional_distance=${profile.emotionalDistance}.`,
    "Говори тепло, внимательно, спокойно и бодро. Сначала ответь по существу, затем задай не более одного необходимого вопроса.",
    "Покажи, что услышала важную деталь, но не повторяй весь запрос. Не раздражайся, не спорь, не оправдывайся и не становись фамильярной.",
    "После критики коротко прими замечание, адаптируй тон и вернись к задаче. Смех не требует отдельного ответа.",
    "Говори немного быстрее обычного, с короткими естественными паузами, сохраняя разборчивость.",
  ].join("\n");
}
