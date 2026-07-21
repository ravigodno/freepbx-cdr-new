import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diagnoseCall } from '../server/callIntelligence/diagnosis.js';

const answeredCore = {
  cdr: [{ calldate: '2026-07-21 12:00:00', src: '100', dst: '200', channel: 'SIP/100-a', dstchannel: 'PJSIP/200-b', disposition: 'ANSWERED', billsec: 35, duration: 40, linkedid: '1.1' }],
  cel: [{ eventtype: 'BRIDGE_ENTER', eventtime: '2026-07-21 12:00:05', channame: 'PJSIP/200-b' }],
  timeline: [], graph: { nodes: [{ id: 'a', type: 'endpoint', label: 'SIP/100' }, { id: 'b', type: 'endpoint', label: 'PJSIP/200' }], edges: [] }
};

const successful = diagnoseCall({ core: answeredCore, quality: { available: false, reason: 'rtcp_unavailable', rows: [] } });
assert.equal(successful.status, 'no_problem');
assert.equal(successful.confidence, 'confirmed');
assert.equal(successful.quality.status, 'insufficient_data');
assert.equal(successful.problems.length, 0, 'absence of RTCP must not become a problem');

const sip503 = diagnoseCall({ core: answeredCore, sip: { events: [{ statusCode: 503, statusText: 'Service Unavailable', timestamp: '2026-07-21T12:00:01Z' }] } });
assert.equal(sip503.status, 'problem_found');
assert.equal(sip503.problems[0].code, 'sip_503');
assert.equal(sip503.problems[0].confidence, 'confirmed');
assert.match(sip503.problems[0].recommendations[0], /транк/i);

const sip486 = diagnoseCall({ core: { cdr: [], cel: [] }, sip: { events: [{ responseCode: '486 Busy Here' }] } });
assert.equal(sip486.problems[0].code, 'sip_486');
assert.match(sip486.problems[0].title, /занят/i);

const unavailable = diagnoseCall({ core: { cdr: [{ calldate: '2026-07-21 12:00:00', disposition: 'CHANUNAVAIL', src: '100', dst: '200' }], cel: [] } });
assert.equal(unavailable.problems[0].code, 'channel_unavailable');
assert.equal(unavailable.problems[0].confidence, 'confirmed');

const quality = diagnoseCall({ core: answeredCore, quality: { available: true, rows: [{ sampled_at: '2026-07-21 12:00:10', rtp_loss: 16, jitter_ms: 48, mos: 3.1 }] } });
assert.equal(quality.quality.status, 'problem');
assert(quality.problems.some(item => item.code === 'rtp_loss_critical'));
assert(quality.problems.some(item => item.code === 'rtp_jitter'));
assert(quality.problems.some(item => item.code === 'low_mos'));

const queue = diagnoseCall({ core: { cdr: [{ calldate: '2026-07-21 12:00:00', lastapp: 'Queue', dcontext: 'ext-queues', dst: 'support', duration: 35, billsec: 0, disposition: 'NOANSWER' }], cel: [{ eventtype: 'RINGING', eventtime: '2026-07-21 12:00:02' }], graph: { nodes: [], edges: [] } }, logs: { timeline: [{ type: 'queue', title: 'EXITWITHTIMEOUT', occurredAt: '2026-07-21T12:00:35Z' }] } });
assert(queue.problems.some(item => item.code === 'queue_timeout'));

const followMe = diagnoseCall({ core: { cdr: [{ src: '200', dst: '79990000000', lastapp: 'Dial', dcontext: 'ext-findmefollow', disposition: 'ANSWERED', billsec: 10 }], cel: [], graph: { nodes: [{ type: 'endpoint', label: 'PJSIP/200' }, { type: 'local', label: 'Local/200' }, { type: 'trunk', label: 'PJSIP/provider' }], edges: [{ type: 'Follow Me' }] } } });
assert.deepEqual(followMe.route.map(item => item.label), ['PJSIP/200', 'Local/200', 'PJSIP/provider']);

const indirect = diagnoseCall({ core: { cdr: [], cel: [{ eventtype: 'APP_START', appdata: 'Timeout', eventtime: '2026-07-21 12:00:00' }], timeline: [], graph: { nodes: [], edges: [] } } });
assert(indirect.problems.every(item => ['medium', 'low'].includes(item.confidence)), 'indirect evidence must not be high/confirmed');

const empty = diagnoseCall({});
assert.equal(empty.status, 'insufficient_data');
assert.equal(empty.confidence, 'low');

const router = fs.readFileSync('server/callIntelligence/router.ts', 'utf8');
const ui = fs.readFileSync('src/modules/monitoring/tabs/monitoring/CallIntelligencePanel.tsx', 'utf8');
assert(router.includes("'/api/monitoring/call-intelligence/diagnosis/:id'"));
assert(router.includes("check(req, 'view_call_intelligence')"));
assert(ui.includes('Диагностика звонка'));
assert(ui.includes('/call-intelligence/diagnosis/'));
assert(!fs.readFileSync('server/callIntelligence/diagnosis.ts', 'utf8').match(/openai|gemini|anthropic/i));
console.log('Call diagnosis tests: OK');
