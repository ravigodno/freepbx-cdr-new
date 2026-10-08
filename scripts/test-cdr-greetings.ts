import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { announcementId, normalizeAutomatedAnswer, isIvrLeg } from '../shared/automatedCallDestination.js';
import { enrichGreetingDestinations } from '../server/calls/greetingDescriptions.js';
import { buildCdrRowViewModel } from '../src/modules/cdr/utils/CDRRowHelpers.js';
import { buildCallRouteView } from '../src/modules/cdr/utils/buildCallRouteView.js';
import CDRCalleeCell from '../src/modules/cdr/components/CDRCalleeCell.js';
import { CDRStatusCell } from '../src/modules/cdr/components/CDRStatusCell.js';
import { buildAnsweredContactLookup } from '../server/cdrAnsweredLookup.js';
import { classifyMissedCallResolution } from '../server/missedCallResolution.js';

const raw = { src: '79215693128', dst: 's', dcontext: 'app-announcement-5', lastapp: 'BackGround', did: '79184103852',
  disposition: 'ANSWERED', billsec: 4, duration: 5, channel: 'PJSIP/trunk-in-0001', dstchannel: '', linkedid: '1791469196.14076' };
assert.equal(announcementId('app-announcement,5,1'), '5');
assert.equal(isIvrLeg(raw), false);
assert.equal(isIvrLeg({ ...raw, dcontext: 'ivr-5' }), true);
const call = normalizeAutomatedAnswer(raw);
assert.equal(call.disposition, 'NO ANSWER');
assert.equal(call.billsec, 0);
assert.equal(raw.disposition, 'ANSWERED');
assert.equal(normalizeAutomatedAnswer(call).disposition, 'NO ANSWER');
for (const row of [ { ...raw, dstchannel: 'PJSIP/101-0002' }, { ...raw, dstchannel: 'PJSIP/provider-0002' },
  { ...raw, dcontext: 'from-internal', dst: '79991234567' }, { ...raw, answeredExts: ['101'] }, { ...raw, src: '101', did: '' } ]) {
  assert.equal(normalizeAutomatedAnswer(row).disposition, 'ANSWERED');
}
assert.equal(buildAnsweredContactLookup([call]).size, 0, 'A greeting cannot resolve an earlier missed call');
let queries = 0;
await enrichGreetingDestinations([call], async (_sql, ids) => { queries++; assert.deepEqual(ids, ['5']); return [{ announcement_id: 5, description: 'Нерабочее время' }]; });
assert.equal(queries, 1);
const vm = buildCdrRowViewModel(call, []);
assert.equal(vm.isMissed, true);
assert.match(renderToStaticMarkup(React.createElement(CDRStatusCell, { isMissed: vm.isMissed, callDisp: vm.callDisp })), /Пропущен/);
assert.equal(vm.calleeName, 'Приветствие: Нерабочее время');
assert.notEqual(vm.displayedDst, 's');
const html = renderToStaticMarkup(React.createElement(CDRCalleeCell, { call, ...vm, triggerClickToCall: () => {}, openAddFromCall: () => {} }));
assert.match(html, /Приветствие: Нерабочее время/);
assert.doesNotMatch(html, /Позвонить на|Добавить .* в справочник/);
const greeting = { type: 'announcement', destination: 'app-announcement-5', title: vm.calleeName };
const route = buildCallRouteView({ timeline: [raw], routeAnalysis: { direction: 'inbound', steps: [
  { type: 'inbound_route', destination: 'app-announcement,5,1' }, greeting ] } });
assert.equal(route.anyAnswered, false);
assert.equal(route.routeSteps.filter(s => s.label === 'Приветствие').length, 1);
assert.equal(route.routeSteps.some(s => s.label === 'IVR'), false);
assert.match(route.resultText, /Соединение с сотрудником не состоялось/);
const answeredRoute = buildCallRouteView({ timeline: [raw, { ...raw, dcontext: 'ext-local', dst: '101', dstchannel: 'PJSIP/101-0002' }],
  routeAnalysis: { direction: 'inbound', steps: [greeting] } });
assert.equal(answeredRoute.anyAnswered, true, 'Greeting followed by employee answer remains answered');
const fallback = { ...raw };
await enrichGreetingDestinations([fallback], async () => { throw Error('unavailable'); });
assert.equal(buildCdrRowViewModel(fallback, []).calleeName, 'Приветствие №5');
// Regression for the screenshot: seven ordinary misses plus two PBX-answered IVRs.
const missedMs = Date.parse('2026-10-03T10:00:00Z');
const fixtures = [
  ...Array.from({ length: 7 }, (_, i) => ({ ...raw, uniqueid: `miss-${i}`, dcontext: 'ext-local', dst: '353',
    disposition: 'NO ANSWER', billsec: 0, processedAtMs: i < 4 ? missedMs + 600000 : null })),
  ...[38, 11].map((billsec, i) => ({ ...raw, uniqueid: `ivr-${i}`, dcontext: 'ivr-1', billsec, processedAtMs: null }))
];
const normalized = fixtures.map(normalizeAutomatedAnswer);
const views = normalized.map(call => buildCdrRowViewModel(call, []));
assert.equal(views.filter(view => view.isMissed).length, 9);
const missedForCounters = normalized.filter(call => call.disposition === 'NO ANSWER');
assert.equal(missedForCounters.length, 9);
const resolutions = missedForCounters.map(call => classifyMissedCallResolution({ missedMs, nowMs: missedMs + 86400000,
  callbackWindowMs: 300000, processedAtMs: call.processedAtMs }));
assert.equal(resolutions.filter(item => item.isProcessed).length, 4);
assert.equal(resolutions.filter(item => item.isLost).length, 5);
assert.equal(normalized[7].dst, 'IVR 1');
console.log('CDR greetings: technical answer, conversation preservation, names, missed status and timeline passed');
