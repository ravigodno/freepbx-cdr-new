import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SyntheticRealtimeVoiceAdapter } from '../server/ai-platform/voice/providers/adapters/syntheticRealtimeVoiceAdapter.js';
import { OpenAIRealtimeAdapter, readOpenAIRealtimeConfig } from '../server/ai-platform/voice/providers/adapters/openaiRealtimeAdapter.js';
import { RealtimeVoiceProviderRegistry } from '../server/ai-platform/voice/providers/realtimeVoiceProviderRegistry.js';
import { callbackIntent, composeRealtimeInstructions, detectRealtimeTransfer } from '../server/ai-platform/voice/providers/realtimeVoicePolicy.js';
import type { AudioFrame } from '../server/ai-platform/voice/media/mediaTypes.js';

const format = { codec: 'slin16' as const, sampleRate: 16000, channels: 1 as const, frameDurationMs: 20 };
const config = { providerKey: 'synthetic', model: 'synthetic-voice', language: 'ru', voice: 'natural', instructions: 'safe', inputFormat: format, outputFormat: format, serverVad: false, tools: [{ key: 'pbx.get_active_calls', description: 'Read active calls', inputSchema: { type: 'object' } }], timeoutMs: 1000 };
const frame = (source: string): AudioFrame => ({ sequence: 1, timestampMs: Date.now(), direction: 'ingress', codec: 'slin16', sampleRate: 16000, channels: 1, durationMs: 20, payload: new Uint8Array(640), source, traceId: 'test', voiceSessionId: 1, mediaSessionId: 1 });

async function run() {
  const registry = new RealtimeVoiceProviderRegistry(); registry.register('synthetic', () => new SyntheticRealtimeVoiceAdapter()); registry.register('openai_realtime', () => new OpenAIRealtimeAdapter());
  assert.equal(registry.list().length, 2); assert.equal(registry.create('synthetic').getCapabilities().speechToSpeech, true); assert.equal(registry.create('openai_realtime').getCapabilities().tools, false); assert.throws(() => registry.create('unknown'), /Unknown/);
  const adapter = new SyntheticRealtimeVoiceAdapter(), events: any[] = []; adapter.subscribeEvents(event => events.push(event)); const controller = new AbortController();
  assert.equal((await adapter.validateConfig(config)).valid, true); await adapter.connect(config, controller.signal); await adapter.configureSession(config); await adapter.appendAudio(frame('question')); await adapter.commitInput();
  assert(events.some(event => event.type === 'output_audio')); assert(events.some(event => event.type === 'transcript' && event.kind === 'input_final')); assert(events.filter(event => event.type === 'output_audio').every(event => event.frame.payload.byteLength > 0));
  events.length = 0; await adapter.appendAudio(frame('tool_query')); await adapter.commitInput(); assert(events.some(event => event.type === 'tool_call' && event.toolKey === 'pbx.get_active_calls')); assert(!events.some(event => event.executorKey));
  events.length = 0; await adapter.appendAudio(frame('callback_request')); await adapter.commitInput(); assert(events.some(event => event.type === 'transcript' && callbackIntent(event.text)));
  events.length = 0; await adapter.appendAudio(frame('transfer_request')); await adapter.commitInput(); assert(events.some(event => event.type === 'transcript' && detectRealtimeTransfer(event.text)));
  await adapter.cancelResponse(); assert.equal(adapter.getHealth().state, 'connected'); await adapter.close(); assert.equal(adapter.getHealth().state, 'disconnected');
  const instructions = composeRealtimeInstructions({ agent: { name: 'Receptionist', type: 'receptionist', version: { id: 3 } }, behavior: { responseStyle: { response_style: 'natural' } } }, 'ru'); assert.equal(instructions.checksum.length, 64); assert.match(instructions.instructions, /1–3/); assert.doesNotMatch(instructions.instructions, /password|api[_ -]?key/i);
  const openai = new OpenAIRealtimeAdapter(); const missing = { ...config, providerKey: 'openai_realtime', apiKey: '' }; assert.equal((await openai.validateConfig(missing)).valid, false); assert.equal(readOpenAIRealtimeConfig().configured, Boolean(process.env.OPENAI_API_KEY));
  const router = fs.readFileSync('server/ai-platform/voice/providers/api/realtimeVoiceRouter.ts', 'utf8'), migration = fs.readFileSync('server/pbxpulsMigrations.ts', 'utf8'), service = fs.readFileSync('server/ai-platform/voice/providers/realtimeVoiceSessionService.ts', 'utf8');
  assert.match(router, /Raw audio payload is forbidden/); assert.doesNotMatch(router, /apiKey|Authorization|providerSessionIdHash/); assert.match(migration, /ai\.realtime_voice_enabled','false/); assert.match(migration, /ai\.realtime_voice_provider','synthetic/); assert.match(service, /transferRequired=true/); assert.match(service, /toolCalls>2/); assert.doesNotMatch(service, /asterisk\s+-rx|external_host|createBridge|answerChannel/i);
  console.log('AI Platform realtime voice tests passed');
}
run().catch(error => { console.error(error); process.exit(1); });
