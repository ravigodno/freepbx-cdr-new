import {
  compileVoiceProfileInstructions,
  normalizeVoiceProfile,
  type VoiceProfile,
} from "./voiceProfile.js";

export const RUSSIAN_VOICE_COMPARISON_TEXTS={
  primary:"Здравствуйте. Я внимательно вас слушаю. Чем могу помочь?",
  additional:"Хорошо. На какую дату и время вас записать?",
} as const;

export type RussianVoiceComparisonTextKey=keyof typeof RUSSIAN_VOICE_COMPARISON_TEXTS;

export function buildRussianVoiceComparisonRequest(value:any){
  const profile=normalizeVoiceProfile({
    ...value,
    language:"ru",
    locale:"ru-RU",
    pronunciationStyle:"native_neutral",
    speakingRate:"slightly_fast",
    pauseStyle:"short_natural",
  });
  const textKey=(value?.textKey==="additional"?"additional":"primary") as RussianVoiceComparisonTextKey;
  const customText=String(value?.text||"").trim().replace(/\s+/gu," ").slice(0,300);
  return {
    profile,
    textKey,
    text:customText||RUSSIAN_VOICE_COMPARISON_TEXTS[textKey],
    instructions:compileVoiceProfileInstructions(profile),
    output:{codec:"slin16" as const,sampleRate:16000,channels:1 as const,frameDurationMs:20},
  };
}

export function comparisonProfile(voiceId:string):VoiceProfile{
  return normalizeVoiceProfile({voiceId,language:"ru",locale:"ru-RU"});
}
