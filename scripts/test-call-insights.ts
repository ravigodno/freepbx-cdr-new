import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildProblemInsights, findSimilarProblems, observationsFromLogs, observationsFromQuality } from '../server/callIntelligence/insights.js';

const sipRows = [
  { event_type: 'sip_503', category: 'sip', source_name: 'Asterisk', trunk: 'MTS', message: '503 Service Unavailable', problem_count: 10, first_seen: '2026-07-21 10:00:00', last_seen: '2026-07-21 11:00:00' },
  { event_type: 'sip_503', category: 'sip', source_name: 'Asterisk', trunk: 'MTS', message: '503 Service Unavailable', problem_count: 4, first_seen: '2026-07-21 11:10:00', last_seen: '2026-07-21 11:20:00' },
  { event_type: 'sip_503', category: 'sip', source_name: 'Asterisk', trunk: 'Beeline', message: '503 Service Unavailable', problem_count: 2, first_seen: '2026-07-21 11:30:00', last_seen: '2026-07-21 11:40:00' }
];
const current = observationsFromLogs(sipRows);
const previous = observationsFromLogs([{ ...sipRows[0], problem_count: 2 }], true);
const result = buildProblemInsights({ period: '24h', from: '2026-07-21T00:00:00Z', to: '2026-07-22T00:00:00Z', observations: [...current, ...previous], totalCalls: 100, problemCalls: 16 });
const mts = result.insights.find(item => item.type === 'sip_503' && item.affectedObjects.some(value => value.name === 'MTS'));
const beeline = result.insights.find(item => item.type === 'sip_503' && item.affectedObjects.some(value => value.name === 'Beeline'));
assert(mts && beeline, 'different trunks must be separate insight groups');
assert.equal(mts.count, 14, 'same SIP 503/trunk must be grouped');
assert.equal(mts.previousCount, 2);
assert.equal(mts.trend, 'rising');
assert.equal(mts.changePercent, 600);
assert.equal(mts.severity, 'critical');
assert.equal(findSimilarProblems(current, 'sip_503', { type: 'trunk', name: 'MTS' }).length, 2);

const queue = observationsFromLogs([{ event_type: 'queue_timeout', category: 'asterisk', source_name: 'queue_log', service: 'support', message: 'EXITWITHTIMEOUT', problem_count: 3, first_seen: '2026-07-21 10:00:00', last_seen: '2026-07-21 11:00:00' }]);
assert(queue.some(item => item.problem.code === 'queue_timeout' && item.object?.type === 'queue'));

const quality = observationsFromQuality([{ ext: '200', problem_count: 5, max_loss: 16, max_jitter: 48, min_mos: 3.1, first_seen: '2026-07-21 10:00:00', last_seen: '2026-07-21 11:00:00' }]);
assert(quality.some(item => item.problem.code === 'rtp_loss_critical'));
assert(quality.every(item => item.object?.type === 'endpoint'));
assert.equal(observationsFromQuality([]).length, 0, 'missing RTCP is not a problem');

const empty = buildProblemInsights({ period: '1h', from: '2026-07-21T10:00:00Z', to: '2026-07-21T11:00:00Z', observations: [] });
assert.equal(empty.totalProblems, 0);
assert.deepEqual(empty.insights, []);

const router = fs.readFileSync('server/callIntelligence/router.ts', 'utf8');
const service = fs.readFileSync('server/callIntelligence/insights.ts', 'utf8');
const ui = fs.readFileSync('src/modules/monitoring/tabs/monitoring/CallIntelligencePanel.tsx', 'utf8');
for (const endpoint of ['insights', 'problem-history', 'problem/:type', 'trends']) assert(router.includes(`/call-intelligence/${endpoint}`));
assert(router.includes("check(req, 'view_call_intelligence')"));
assert(service.includes('insightsCache') && service.includes('CACHE_TTL'));
assert(ui.includes('Аналитика повторяющихся проблем'));
assert(!/Math\.random|demo insight|mock insight/i.test(service));
console.log('Call insights tests: OK');
