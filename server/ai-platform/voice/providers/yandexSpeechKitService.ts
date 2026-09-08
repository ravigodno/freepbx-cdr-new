import fetch from "node-fetch";
import { Agent } from 'node:https';
import { readYandexAudioStream } from './yandexAudioStream.js';
import { AiPlatformError } from "../../core/errors.js";
import type { ProviderConfig } from "../../providers/providerAdapter.js";

const TTS_URL = "https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis";
const STT_URL = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";
const ttsAgent=new Agent({keepAlive:true,maxSockets:16,maxFreeSockets:4,timeout:10000});
const VOICE_ROLES: Record<string, string[]> = {
  marina: ["neutral", "friendly", "whisper"],
  alena: ["neutral", "good"],
  dasha: ["neutral", "good", "friendly"],
  jane: ["neutral", "good", "evil"],
  omazh: ["neutral", "evil"],
  julia: ["neutral", "strict"],
  lera: ["neutral", "friendly"],
  masha: ["good", "strict", "friendly"],
  saule_ru: ["neutral", "strict", "whisper"],
  zamira_ru: ["neutral", "strict", "friendly"],
  zhanar_ru: ["neutral", "strict", "friendly"],
  yulduz_ru: ["neutral", "strict", "friendly", "whisper"],
  filipp: [],
  ermil: ["neutral", "good"],
  zahar: ["neutral", "good"],
  alexander: ["neutral", "good"],
  kirill: ["neutral", "strict", "good"],
  anton: ["neutral", "good"],
  madi_ru: [],
};

function decodeV3Audio(payload: string): Buffer {
  const chunks: Buffer[] = [];
  for (const line of payload
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)) {
    let item: any;
    try {
      item = JSON.parse(line);
    } catch {
      throw new AiPlatformError(
        "internal_error",
        502,
        "Yandex SpeechKit v3 вернул некорректный JSON",
      );
    }
    const data = item?.result?.audioChunk?.data;
    if (typeof data === "string" && data)
      chunks.push(Buffer.from(data, "base64"));
  }
  const audio = Buffer.concat(chunks);
  if (!audio.length)
    throw new AiPlatformError(
      "internal_error",
      502,
      "Yandex SpeechKit v3 не вернул аудио",
    );
  return audio;
}

export function yandexPronunciationText(text:string,entries:Array<{source:string;pronunciation:string}>){
  const digits=['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
  // Explicit +7 phone, or a labelled telephone field. Do not reinterpret prices.
  let result=text.replace(/(?<![\p{L}\p{N}])\+7(?:[ ()-]*\d){10}(?!\d)|((?:телефон|номер)(?:\s+телефона)?\s*[:—-]?\s*)([78](?:[ ()-]*\d){10})(?!\d)/giu,(match,prefix,phone)=>{
    const value=phone||match;
    return (prefix||'')+value.replace(/\D/g,'').split('').map((d:string)=>digits[Number(d)]).join(' ');
  });
  for(const entry of entries){
    const source=entry.source.trim();if(!source)continue;
    const escaped=source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    result=result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'giu'),()=>entry.pronunciation);
  }
  return result.replace(/([аеёиоуыэюяАЕЁИОУЫЭЮЯ])\u0301/g,'+$1');
}
export async function synthesizeYandexSpeech(
  config: ProviderConfig,
  text: string,
  voiceOverride?: string,
  profileOptions?: { role?: string; speechRate?: number; signal?:AbortSignal; onPcmChunk?:(audio:Buffer)=>void },
) {
  if (config.providerKey !== "yandex" || !config.secret)
    throw new AiPlatformError(
      "provider_not_configured",
      503,
      "Yandex SpeechKit не настроен",
    );
  const folderId = String(config.options?.folderId || "").trim();
  if (!folderId)
    throw new AiPlatformError(
      "provider_not_configured",
      503,
      "Folder ID Yandex Cloud не настроен",
    );
  const voice = String(voiceOverride || config.options?.voice || "marina"),
    configuredRole = String(
      profileOptions?.role || config.options?.role || "neutral",
    );
  const supportedRoles = VOICE_ROLES[voice];
  if (!supportedRoles)
    throw new AiPlatformError(
      "invalid_request",
      400,
      "Голос недоступен в SpeechKit API v3",
    );
  const role = supportedRoles.includes(configuredRole)
    ? configuredRole
    : supportedRoles[0];
  if (
    !/^[a-z0-9_]{2,100}$/.test(voice) ||
    (role && !/^[a-z0-9_-]{2,50}$/.test(role))
  )
    throw new AiPlatformError(
      "invalid_request",
      400,
      "Некорректный голос SpeechKit",
    );
  const speed = Math.max(
    0.1,
    Math.min(
      3,
      Number(profileOptions?.speechRate ?? config.options?.speechRate) || 1,
    ),
  );
  const hints: Array<Record<string, string | number>> = [{ voice }, { speed }];
  if (role) hints.push({ role });
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20_000);
  const cancel=()=>controller.abort();
  profileOptions?.signal?.addEventListener('abort',cancel,{once:true});
  if(profileOptions?.signal?.aborted)cancel();
  try {
    const sourceText = String(text).slice(0, 5000);
    const response = await fetch(TTS_URL, {
      method: "POST",
      agent:ttsAgent,
      signal: controller.signal as any,
      headers: {
        Authorization: `Api-Key ${config.secret}`,
        "x-folder-id": folderId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: sourceText,
        hints,
        unsafeMode: sourceText.length > 250,
        ...(profileOptions?.onPcmChunk?{outputAudioSpec:{rawAudio:{audioEncoding:'LINEAR16_PCM',sampleRateHertz:'8000'}}}:{}),
      }),
    });
    if (!response.ok)
      throw new AiPlatformError(
        "internal_error",
        502,
        `Yandex SpeechKit вернул HTTP ${response.status}`,
      );
    if(profileOptions?.onPcmChunk){
      await readYandexAudioStream(response.body as any,audio=>{
        if(!controller.signal.aborted)profileOptions.onPcmChunk!(audio);
      });
      return Buffer.alloc(0);
    }
    return decodeV3Audio(await response.text());
  } catch (error: any) {
    if (error?.name === "AbortError")
      throw new AiPlatformError(
        "internal_error",
        504,
        "Yandex SpeechKit не ответил вовремя",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    profileOptions?.signal?.removeEventListener('abort',cancel);
  }
}

export async function recognizeYandexSpeech(
  config: ProviderConfig,
  pcm: Buffer,
  options?:{signal?:AbortSignal},
) {
  if (config.providerKey !== "yandex" || !config.secret)
    throw new AiPlatformError(
      "provider_not_configured",
      503,
      "Yandex SpeechKit не настроен",
    );
  const folderId = String(config.options?.folderId || "").trim();
  if (!folderId)
    throw new AiPlatformError(
      "provider_not_configured",
      503,
      "Folder ID Yandex Cloud не настроен",
    );
  if (!pcm.length || pcm.length > 1024 * 1024)
    throw new AiPlatformError(
      "invalid_request",
      400,
      "Аудиофрагмент SpeechKit должен быть от 1 байта до 1 МБ",
    );
  const language = String(config.options?.sttLanguage || "ru-RU");
  const url = new URL(STT_URL);
  url.searchParams.set("folderId", folderId);
  url.searchParams.set("lang", language);
  url.searchParams.set("format", "lpcm");
  url.searchParams.set("sampleRateHertz", "16000");
  url.searchParams.set("topic", "general");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20_000);
  const cancel=()=>controller.abort();
  options?.signal?.addEventListener('abort',cancel,{once:true});
  if(options?.signal?.aborted)cancel();
  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      agent:ttsAgent,
      signal: controller.signal as any,
      headers: {
        Authorization: `Api-Key ${config.secret}`,
        "Content-Type": "application/octet-stream",
      },
      body: pcm,
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok)
      throw new AiPlatformError(
        "internal_error",
        502,
        `Yandex SpeechKit STT вернул HTTP ${response.status}`,
      );
    return {
      text: String(data?.result || ""),
      confidence: Number(data?.confidence) || null,
    };
  } catch (error: any) {
    if (error?.name === "AbortError")
      throw new AiPlatformError(
        "internal_error",
        504,
        "Yandex SpeechKit STT не ответил вовремя",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    options?.signal?.removeEventListener('abort',cancel);
  }
}
