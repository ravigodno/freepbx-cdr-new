import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import fetch from 'node-fetch';
import { anonymizeCallIntelligenceContext, explainStructuredContext, type CallIntelligenceContext } from '../server/callIntelligence/aiAnalyst.js';
import { registerCallIntelligenceRoutes } from '../server/callIntelligence/router.js';

const context: CallIntelligenceContext = {
  kind: 'call',
  call: { direction: 'outbound', duration: 120, caller: '100', callee: '+79991234567', ip: '192.168.1.7', linkedid: '1784615534.30' },
  diagnosis: { status: 'problem_found', summary: 'SIP 503 Service Unavailable', confidence: 'confirmed' },
  evidence: [{ source: 'sip', message: '503 Service Unavailable from 192.168.1.7 to +79991234567' }],
  route: [{ type: 'extension', label: 'Extension 100' }, { type: 'trunk', label: 'MTS' }],
  quality: { available: false, reason: 'rtcp_unavailable' },
  problems: [{ type: 'sip', code: 'sip_503', title: 'Транк недоступен', severity: 'critical' }],
  insights: { similarProblems: 24 },
  recommendations: ['Проверить регистрацию SIP trunk']
};

const masked: any = anonymizeCallIntelligenceContext(context);
assert(!JSON.stringify(masked).includes('192.168.1.7'));
assert(!JSON.stringify(masked).includes('79991234567'));
assert(!JSON.stringify(masked).includes('1784615534.30'));
assert(JSON.stringify(masked).includes('503'));

let calls = 0, sent = '';
const deps: any = {
  getAiSettings: async () => ({ provider: 'openai', model: 'test-model', temperature: 0.1, apiKey: 'test-key' }),
  completeAi: async (params: any) => { calls++; sent = params.messages[0].text; return JSON.stringify({ explanation: 'Факт: SIP trunk вернул 503. Вывод: транк недоступен. Уверенность: высокая.' }); }
};
const first = await explainStructuredContext(deps, context, 'test:sip503');
const second = await explainStructuredContext(deps, context, 'test:sip503');
assert.equal(calls, 1); assert.equal(first.cached, false); assert.equal(second.cached, true);
assert.equal(first.confidence, 'confirmed'); assert.deepEqual(first.recommendations, ['Проверить регистрацию SIP trunk']);
assert(!sent.includes('192.168.1.7')); assert(!sent.includes('79991234567')); assert(!sent.includes('test-key'));
assert.equal(first.facts[0].source, 'sip');

await assert.rejects(() => explainStructuredContext({ getAiSettings: async () => ({ provider: 'openai' }), completeAi: deps.completeAi } as any, context, 'not-configured'), /не настроен/i);

const router = fs.readFileSync('server/callIntelligence/router.ts', 'utf8');
const ui = fs.readFileSync('src/modules/monitoring/tabs/monitoring/CallIntelligencePanel.tsx', 'utf8');
for (const endpoint of ['ai/explain-call/:id', 'ai/explain-report/:type']) assert(router.includes(endpoint));
assert(router.includes("check(req, 'view_call_intelligence')"));
assert(router.includes("check(req, 'view_ai_pbx_admin')"));
assert(ui.includes('Объяснить звонок')); assert(ui.includes('Объяснить отчёт'));
assert(!/demo response|fake ai|mock explanation/i.test(fs.readFileSync('server/callIntelligence/aiAnalyst.ts', 'utf8')));

const app = express(); app.use(express.json());
const auth = () => (req: any, res: any, next: any) => req.headers.authorization ? next() : res.status(401).json({ error: 'Unauthorized' });
const check = async (req: any, permission: string) => String(req.headers['x-test-permissions'] || '').split(',').includes(permission);
registerCallIntelligenceRoutes(app, auth, check, {
  queryCdr: async () => [], getAiSettings: deps.getAiSettings, completeAi: deps.completeAi,
  getSipDialogs: () => ({ dialogs: [], events: [], engine: 'PBXPuls SIP parser', session: null })
} as any);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const address: any = server.address(), url = `http://127.0.0.1:${address.port}/api/monitoring/call-intelligence/ai/explain-report/daily`;
assert.equal((await fetch(url, { method: 'POST' })).status, 401);
assert.equal((await fetch(url, { method: 'POST', headers: { authorization: 'Bearer test', 'x-test-permissions': 'view_call_intelligence' } })).status, 403);
assert.equal((await fetch(url, { method: 'POST', headers: { authorization: 'Bearer test', 'x-test-permissions': 'view_call_intelligence,view_ai_pbx_admin' } })).status, 200);
await new Promise<void>(resolve => server.close(() => resolve()));
console.log('Call AI Analyst tests: OK');
