export const YANDEX_SPEECHKIT_VOICE_MANIFEST_VERSION = '2026-09-04-v3';
const voices:Array<[string,string,string,'female'|'male',string[]]>=[
 ['marina','Марина','Нейтральная / дружелюбная / шёпот','female',['neutral','friendly','whisper']],
 ['alena','Алёна','Нейтральная / радостная','female',['neutral','good']],
 ['dasha','Даша','Нейтральная / радостная / дружелюбная','female',['neutral','good','friendly']],
 ['jane','Джейн','Нейтральная / радостная / раздражённая','female',['neutral','good','evil']],
 ['omazh','Омаж','Нейтральная / раздражённая','female',['neutral','evil']],
 ['julia','Юлия','Нейтральная / строгая','female',['neutral','strict']],
 ['lera','Лера','Нейтральная / дружелюбная','female',['neutral','friendly']],
 ['masha','Маша','Радостная / строгая / дружелюбная','female',['good','strict','friendly']],
 ['saule_ru','Сауле','Нейтральная / строгая / шёпот','female',['neutral','strict','whisper']],
 ['zamira_ru','Замира','Нейтральная / строгая / дружелюбная','female',['neutral','strict','friendly']],
 ['zhanar_ru','Жанар','Нейтральная / строгая / дружелюбная','female',['neutral','strict','friendly']],
 ['yulduz_ru','Юлдуз','Нейтральная / строгая / дружелюбная / шёпот','female',['neutral','strict','friendly','whisper']],
 ['filipp','Филипп','Без амплуа','male',[]],['ermil','Ермил','Нейтральный / радостный','male',['neutral','good']],
 ['zahar','Захар','Нейтральный / радостный','male',['neutral','good']],['alexander','Александр','Нейтральный / радостный','male',['neutral','good']],
 ['kirill','Кирилл','Нейтральный / строгий / радостный','male',['neutral','strict','good']],['anton','Антон','Нейтральный / радостный','male',['neutral','good']],
 ['madi_ru','Мади','Без амплуа','male',[]],
];
export const YANDEX_SPEECHKIT_VOICE_MANIFEST=voices.map(([voiceId,displayName,description,gender,roles],sortOrder)=>({voiceId,displayName,description,sortOrder,gender,roles,apiVersion:'v3',modelCompatibility:['speechkit-v3'],supportedOutputFormats:['wav'],supportedSampleRates:[22050],previewAvailable:true}));
