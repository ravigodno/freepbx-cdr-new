import { OPENAI_REALTIME_VOICE_MANIFEST } from "../providers/manifests/openaiRealtimeVoiceManifest.js";
import { OPENAI_REALTIME_MODELS } from "../../../../shared/openAiModelCatalog.js";

export const OPENAI_REALTIME_VOICES = OPENAI_REALTIME_VOICE_MANIFEST.map(
  (item) => item.voiceId,
);

export type VoiceProfile = {
  schemaVersion: 1;
  provider: "openai_realtime" | "yandex_speechkit";
  voiceId: string;
  language: string;
  locale: string;
  pronunciationStyle: "native_neutral" | "neutral" | "custom";
  speakingRate: "normal" | "slightly_fast";
  pauseStyle: "short_natural" | "natural";
  expressiveness: "warm_moderate" | "neutral";
  pitchStyle: "neutral" | "low" | "high";
  role: string;
  speechRate: number;
  sttLanguage: string;
  eouSensitivity: number;
  endOfUtteranceSilenceMs: number;
  realtimeModel: string;
  transcriptionModel: string;
  openaiMaxOutputTokens: number | "inf";
  reasoningEffort: "low" | "medium" | "high";
  noiseReduction: "near_field" | "far_field" | "off";
  turnDetection: "local" | "server_vad" | "semantic_vad";
  responseEagerness: "low" | "medium" | "high";
  responseLength: "short" | "normal" | "detailed";
  maxResponseAudioSeconds: number;
  pronunciationDictionaryId?: number | null;
  pronunciationInstructions?: string;
};

export type PronunciationEntry = {
  source: string;
  pronunciation: string;
  stress?: string;
  aliases?: string[];
};

export const DEFAULT_RUSSIAN_TEST_PHRASE =
  "Здравствуйте. Я внимательно вас слушаю. Чем могу помочь?";

export function normalizeVoiceProfile(value: any): VoiceProfile {
  const provider =
    value?.provider === "yandex_speechkit"
      ? "yandex_speechkit"
      : "openai_realtime";
  const voiceId = String(
    value?.voiceId || (provider === "yandex_speechkit" ? "marina" : "marin"),
  );
  if (!/^[a-z0-9][a-z0-9_-]{1,99}$/.test(voiceId))
    throw new Error("Unsupported OpenAI Realtime voice");
  const locale = String(value?.locale || "ru-RU");
  const clamp = (
    input: unknown,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const parsed = Number(input);
    return Math.max(
      min,
      Math.min(max, Number.isFinite(parsed) ? parsed : fallback),
    );
  };
  return {
    schemaVersion: 1,
    provider,
    voiceId,
    language: String(value?.language || "ru"),
    locale,
    pronunciationStyle: ["native_neutral", "neutral", "custom"].includes(
      value?.pronunciationStyle,
    )
      ? value.pronunciationStyle
      : "native_neutral",
    speakingRate: value?.speakingRate === "normal" ? "normal" : "slightly_fast",
    pauseStyle: value?.pauseStyle === "natural" ? "natural" : "short_natural",
    expressiveness:
      value?.expressiveness === "neutral" ? "neutral" : "warm_moderate",
    pitchStyle: ["low", "high"].includes(value?.pitchStyle)
      ? value.pitchStyle
      : "neutral",
    role: /^[a-z0-9_-]{2,50}$/.test(String(value?.role || ""))
      ? String(value.role)
      : "neutral",
    speechRate: clamp(value?.speechRate, 1, 0.1, 3),
    sttLanguage: /^[a-z]{2}(?:-[A-Z]{2})?$/.test(
      String(value?.sttLanguage || ""),
    )
      ? String(value.sttLanguage)
      : locale,
    eouSensitivity: clamp(value?.eouSensitivity, 0.9, 0, 1),
    endOfUtteranceSilenceMs: clamp(
      value?.endOfUtteranceSilenceMs,
      700,
      100,
      3000,
    ),
    realtimeModel: (provider === "openai_realtime"
      ? OPENAI_REALTIME_MODELS
      : ["speech-realtime-260528", "speech-realtime-250923", "speech-realtime-deepseek-v4-flash"]
    ).includes(String(value?.realtimeModel || "") as any)
      ? String(value.realtimeModel)
      : provider === "openai_realtime" ? "gpt-realtime-2.1" : "speech-realtime-260528",
    transcriptionModel: ["gpt-live-transcribe", "gpt-transcribe", "gpt-realtime-whisper", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"].includes(String(value?.transcriptionModel || ""))
      ? String(value.transcriptionModel) : "gpt-live-transcribe",
    openaiMaxOutputTokens: value?.openaiMaxOutputTokens === "inf" ? "inf" : clamp(value?.openaiMaxOutputTokens, 240, 1, 4096),
    reasoningEffort: ["low", "medium", "high"].includes(value?.reasoningEffort) ? value.reasoningEffort : "low",
    noiseReduction: ["near_field", "far_field", "off"].includes(value?.noiseReduction) ? value.noiseReduction : "near_field",
    turnDetection: ["local", "server_vad", "semantic_vad"].includes(value?.turnDetection) ? value.turnDetection : "local",
    responseEagerness: ["low", "medium", "high"].includes(value?.responseEagerness) ? value.responseEagerness : "high",
    responseLength: ["short", "normal", "detailed"].includes(value?.responseLength) ? value.responseLength : "normal",
    maxResponseAudioSeconds: clamp(value?.maxResponseAudioSeconds, 15, 8, 30),
    pronunciationDictionaryId: value?.pronunciationDictionaryId
      ? Number(value.pronunciationDictionaryId)
      : null,
    pronunciationInstructions: String(value?.pronunciationInstructions || "")
      .trim()
      .slice(0, 1000),
  };
}

const safeVoiceText = (value: unknown, max: number) =>
  String(value || "")
    .trim()
    .slice(0, max);

export function normalizePronunciationEntries(
  value: unknown,
): PronunciationEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map((item: any) => ({
      source: safeVoiceText(item?.source, 191),
      pronunciation: safeVoiceText(item?.pronunciation, 191),
      stress: safeVoiceText(item?.stress, 100),
      aliases: Array.isArray(item?.aliases)
        ? item.aliases
            .slice(0, 20)
            .map((alias: unknown) => safeVoiceText(alias, 191))
            .filter(Boolean)
        : [],
    }))
    .filter((item) => item.source && item.pronunciation);
}

export function compileVoiceProfileInstructions(
  value: any,
  entries: PronunciationEntry[] = [],
) {
  const profile = normalizeVoiceProfile(value);
  const instructions = [
    "Говори как носитель русского языка: естественно, спокойно, доброжелательно и разборчиво. Используй чистое нормативное русское произношение, русскую интонацию и ударения, короткие естественные паузы.",
  ];
  instructions.push(profile.responseLength === "short"
    ? "Отвечай кратко: одно-два предложения."
    : profile.responseLength === "detailed"
      ? "Можно отвечать подробно: до четырёх-пяти предложений."
      : "Отвечай обычной длиной: до двух-трёх предложений.");
  instructions.push("В перечислении называй не более трёх позиций за одну реплику, затем спроси, перечислить ли остальные.");
  if (entries.length) {
    instructions.push("Соблюдай словарь произношения:");
    for (const item of entries)
      instructions.push(
        `${item.source}: ${item.pronunciation}${item.stress ? `; ударение ${item.stress}` : ""}.`,
      );
  }
  if (profile.pronunciationInstructions)
    instructions.push(
      `Дополнительные инструкции произношения: ${profile.pronunciationInstructions}`,
    );
  return instructions.join("\n");
}
