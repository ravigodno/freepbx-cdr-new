import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const builder=fs.readFileSync(new URL('../src/modules/aiPlatform/AiAgentBuilderPage.tsx',import.meta.url),'utf8');
const agents=fs.readFileSync(new URL('../src/modules/aiPlatform/VoiceAgentsManagementPage.tsx',import.meta.url),'utf8');
const settings=fs.readFileSync(new URL('../src/modules/aiPlatform/VoiceSettingsPanel.tsx',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../server/ai-platform/voice/management/voiceAgentRouteService.ts',import.meta.url),'utf8');

assert.ok(app.includes('/(?:knowledge|voice)'));
assert.match(app,/view_ai_voice_catalog/);
assert.match(app,/generate_ai_voice_preview/);
assert.match(app,/manage_ai_voice_profiles/);
assert.match(builder,/\/ai-platform\/agents\/\$\{agentId\}\/voice/);
assert.match(builder,/Голос и произношение/);
assert.match(builder,/Основное/);
assert.match(builder,/Навыки/);
assert.match(builder,/Публикация/);
assert.match(builder,/Диагностика/);
assert.match(agents,/Настроить голос/);
assert.match(agents,/publishedVoice/);
assert.match(agents,/draftVoice/);
assert.match(agents,/есть несохранённые изменения/);
assert.match(service,/publishedVoice/);
assert.match(service,/hasVoiceDraftChange/);
assert.match(settings,/\/api\/ai-platform\/voice-catalog/);
assert.match(settings,/Прослушать/);
assert.match(settings,/Выбрать/);
assert.match(settings,/Сравнить 2–5/);
assert.match(settings,/Слепое A\/B\/C/);
assert.doesNotMatch(settings,/\[['"]alloy['"],['"]ash['"]/);

console.log('AI Platform voice settings navigation UI checks passed');
