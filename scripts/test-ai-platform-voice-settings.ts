import assert from 'node:assert/strict';
import {containsAiConfigSecrets,findAiConfigSecretField} from '../server/ai-platform/agents/agentConfigurationValidator.js';
import {normalizePronunciationEntries,normalizeVoiceProfile} from '../server/ai-platform/voice/profiles/voiceProfile.js';

const publishedConfig={
  skillEngine:{dynamicFields:true,dynamicCatalogs:true,dynamicTemplates:true,authoritativePlanner:true},
  voice:{provider:'synthetic'},
};
assert.equal(containsAiConfigSecrets(publishedConfig),false);
assert.equal(containsAiConfigSecrets({voiceProfile:{provider:'openai_realtime',voiceId:'marin'}}),false);
assert.equal(containsAiConfigSecrets({metadata:{provider:'openai_realtime',key:'catalog_voice',token:'public label',secret:'not configured'}}),false);

const profile=normalizeVoiceProfile({
  provider:'openai_realtime',voiceId:'marin',language:'ru',locale:'ru-RU',
  speakingRate:'slightly_fast',pauseStyle:'short_natural',pronunciationInstructions:'',
  previewUrl:'blob:https://example.invalid/private',cacheKey:'cache-safe',headers:{Authorization:'Bearer hidden-value'},
});
assert.deepEqual(profile,{
  schemaVersion:1,provider:'openai_realtime',voiceId:'marin',language:'ru',locale:'ru-RU',
  pronunciationStyle:'native_neutral',speakingRate:'slightly_fast',pauseStyle:'short_natural',
  expressiveness:'warm_moderate',pitchStyle:'neutral',pronunciationDictionaryId:null,
  pronunciationInstructions:'',
});
assert.equal(JSON.stringify(profile).includes('previewUrl'),false);
assert.equal(JSON.stringify(profile).includes('cacheKey'),false);
assert.equal(JSON.stringify(profile).includes('headers'),false);

const entries=normalizePronunciationEntries([{
  source:'PBXPuls',pronunciation:'Пи-Би-Икс Пульс',stress:'Пу́льс',aliases:['PBX Puls'],
  previewAudio:'data:audio/wav;base64,AAAA',providerCredentials:{api_key:'sk-hidden-value'},
}]);
assert.deepEqual(entries,[{source:'PBXPuls',pronunciation:'Пи-Би-Икс Пульс',stress:'Пу́льс',aliases:['PBX Puls']}]);

const forbiddenCases:Array<[unknown,string]>=[
  [{api_key:'sk-1234567890'},'api_key'],
  [{headers:{Authorization:'Bearer abcdefghijklmnop'}},'headers.Authorization'],
  [{password:'anything'},'password'],
  [{client_secret:'anything'},'client_secret'],
  [{private_key:'-----BEGIN PRIVATE KEY-----\\nabc'},'private_key'],
  [{pronunciationInstructions:'используй token=abcdefghi'},'pronunciationInstructions'],
  [{pronunciationEntries:[{source:'x',pronunciation:'api_key=sk-1234567890'}]},'pronunciationEntries.0.pronunciation'],
  [{dsn:'mysql://user:password@example.invalid/db'},'dsn'],
];
for(const[value,path]of forbiddenCases)assert.equal(findAiConfigSecretField(value),path);

const draftConfig={...publishedConfig,voiceProfile:profile,voice:{...publishedConfig.voice,endOfTurnSilenceMs:350,speakingRate:profile.speakingRate,pauseStyle:profile.pauseStyle},pronunciationEntries:entries};
assert.equal(draftConfig.voiceProfile.voiceId,'marin');
assert.equal((publishedConfig as any).voiceProfile,undefined);
assert.equal(containsAiConfigSecrets(draftConfig),false);

console.log('AI Platform Voice Settings security and allowlist checks passed');
