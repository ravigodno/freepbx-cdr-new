import { OPENAI_REALTIME_VOICE_MANIFEST } from "../providers/manifests/openaiRealtimeVoiceManifest.js";

export const OPENAI_REALTIME_VOICES=OPENAI_REALTIME_VOICE_MANIFEST.map(item=>item.voiceId);

export type VoiceProfile={
  schemaVersion:1;
  provider:'openai_realtime';
  voiceId:string;
  language:string;
  locale:string;
  pronunciationStyle:'native_neutral'|'neutral'|'custom';
  speakingRate:'normal'|'slightly_fast';
  pauseStyle:'short_natural'|'natural';
  expressiveness:'warm_moderate'|'neutral';
  pitchStyle:'neutral'|'low'|'high';
  pronunciationDictionaryId?:number|null;
  pronunciationInstructions?:string;
};

export type PronunciationEntry={
  source:string;
  pronunciation:string;
  stress?:string;
  aliases?:string[];
};

export const DEFAULT_RUSSIAN_TEST_PHRASE=
  'Здравствуйте. Я внимательно вас слушаю. Чем могу помочь?';

export function normalizeVoiceProfile(value:any):VoiceProfile{
  const voiceId=String(value?.voiceId||'marin');
  if(!/^[a-z0-9][a-z0-9_-]{1,99}$/.test(voiceId))
    throw new Error('Unsupported OpenAI Realtime voice');
  const locale=String(value?.locale||'ru-RU');
  return {
    schemaVersion:1,
    provider:'openai_realtime',
    voiceId,
    language:String(value?.language||'ru'),
    locale,
    pronunciationStyle:['native_neutral','neutral','custom'].includes(value?.pronunciationStyle)
      ? value.pronunciationStyle:'native_neutral',
    speakingRate:value?.speakingRate==='normal'?'normal':'slightly_fast',
    pauseStyle:value?.pauseStyle==='natural'?'natural':'short_natural',
    expressiveness:value?.expressiveness==='neutral'?'neutral':'warm_moderate',
    pitchStyle:['low','high'].includes(value?.pitchStyle)?value.pitchStyle:'neutral',
    pronunciationDictionaryId:value?.pronunciationDictionaryId
      ? Number(value.pronunciationDictionaryId):null,
    pronunciationInstructions:String(value?.pronunciationInstructions||"").trim().slice(0,1000),
  };
}

const safeVoiceText=(value:unknown,max:number)=>String(value||'').trim().slice(0,max);

export function normalizePronunciationEntries(value:unknown):PronunciationEntry[]{
  if(!Array.isArray(value))return[];
  return value.slice(0,100).map((item:any)=>({
    source:safeVoiceText(item?.source,191),
    pronunciation:safeVoiceText(item?.pronunciation,191),
    stress:safeVoiceText(item?.stress,100),
    aliases:Array.isArray(item?.aliases)?item.aliases.slice(0,20).map((alias:unknown)=>safeVoiceText(alias,191)).filter(Boolean):[],
  })).filter(item=>item.source&&item.pronunciation);
}

export function compileVoiceProfileInstructions(
  value:any,
  entries:PronunciationEntry[]=[],
){
  const profile=normalizeVoiceProfile(value);
  const instructions=[
    'Говори по-русски естественно, спокойно, доброжелательно и разборчиво. Используй короткие естественные паузы.',
  ];
  if(entries.length){
    instructions.push('Соблюдай словарь произношения:');
    for(const item of entries)
      instructions.push(`${item.source}: ${item.pronunciation}${item.stress?`; ударение ${item.stress}`:''}.`);
  }
  if(profile.pronunciationInstructions)
    instructions.push(`Дополнительные инструкции произношения: ${profile.pronunciationInstructions}`);
  return instructions.join('\n');
}
