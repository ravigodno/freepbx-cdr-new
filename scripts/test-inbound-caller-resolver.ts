import assert from 'node:assert/strict';
import {
  normalizeInboundLiveSessionCallers,
  resolveInboundExternalCaller,
  resolveInboundLiveCaller
} from '../server/inboundCallerResolver.js';
import { buildCallRouteView } from '../src/modules/cdr/utils/buildCallRouteView.js';
import { buildCdrRowViewModel } from '../src/modules/cdr/utils/CDRRowHelpers.js';
import { isLiveCallPopupVisible, normalizeLiveCallBannerPayload } from '../src/utils/liveCallBanner.js';

const did = '74951234567';
const externalCaller = '79787902449';

const cdrChain = [
  { src: did, cnum: did, callerid: 'MTS', clid: `"MTS" <${did}>`, dst: did, did, dcontext: 'from-trunk', channel: 'PJSIP/MTS-in-00001' },
  { src: did, cnum: '', clid: `"MTS" <${did}>`, dst: '9000', did, dcontext: 'ext-queues', lastapp: 'Queue' },
  { src: '201', cnum: '201', clid: '"201" <201>', dst: '201', did, dcontext: 'ext-local', disposition: 'ANSWERED' }
];
const celChain = [
  { eventtype: 'CHAN_START', cid_num: externalCaller, exten: did, context: 'from-trunk' },
  { eventtype: 'APP_START', cid_num: externalCaller, exten: '9000', context: 'ext-queues' },
  { eventtype: 'ANSWER', cid_num: '201', exten: '201', context: 'ext-local' }
];

const result = resolveInboundExternalCaller(cdrChain, celChain);
assert.equal(result.externalCallerNumber, externalCaller);
assert.equal(result.sourceField, 'cel.cid_num');
assert.equal(result.confidence, 'high');
assert.ok(result.rejectedCandidates.some(candidate => candidate.value === did && candidate.reason === 'did_or_trunk_number'));
assert.ok(result.rejectedCandidates.some(candidate => candidate.value === '9000' || candidate.value === '201'));
assert.ok(result.rejectedCandidates.some(candidate => candidate.value.includes('MTS')));

const cdrFallback = resolveInboundExternalCaller([
  { src: did, cnum: did, clid: `"Клиент ${externalCaller}" <${did}>`, dst: did, did, dcontext: 'from-trunk' },
  { src: externalCaller, cnum: externalCaller, dst: '9000', did, dcontext: 'ext-queues' }
]);
assert.equal(cdrFallback.externalCallerNumber, externalCaller);
assert.notEqual(cdrFallback.externalCallerNumber, did);

const internalOnly = resolveInboundExternalCaller([
  { src: '201', cnum: '201', clid: '"Operator" <201>', dst: '200', dcontext: 'from-internal' }
]);
assert.equal(internalOnly.externalCallerNumber, '');

const routeView = buildCallRouteView({
  externalCallerNumber: externalCaller,
  inboundDid: did,
  trunkNumber: did,
  timeline: [
    { src: did, dst: did, did, dcontext: 'from-trunk', channel: 'PJSIP/MTS-in-00001', disposition: 'NO ANSWER', billsec: 0 },
    { src: externalCaller, dst: '9000', did, dcontext: 'ext-queues', lastapp: 'Queue', lastdata: '9000', duration: 12, disposition: 'ANSWERED', billsec: 45 },
    { src: externalCaller, dst: '201', did, dcontext: 'ext-local', lastapp: 'Dial', dstchannel: 'PJSIP/201-00002', disposition: 'ANSWERED', billsec: 45 }
  ],
  routeAnalysis: {
    direction: 'inbound',
    did,
    answeredExt: '201',
    steps: [
      { type: 'inbound_trunk', title: 'MTS', number: did, destination: did },
      { type: 'inbound_route', title: 'Входящее правило ANY', number: 'ANY', pattern: 'ANY', destination: 'ext-queues,9000,1' }
    ]
  }
});
assert.equal(routeView.routeSteps.find(step => step.label === 'CALLER')?.number, externalCaller);
assert.equal(routeView.routeSteps.find(step => step.label === 'TRUNK')?.title, 'MTS');
assert.equal(routeView.routeSteps.find(step => step.label === 'QUEUE')?.number, '9000');
assert.match(routeView.resultText, /201/);
assert.doesNotMatch(routeView.routeSteps.find(step => step.label === 'CALLER')?.title || '', new RegExp(did));

const rowView = buildCdrRowViewModel({
  src: externalCaller,
  externalCallerNumber: externalCaller,
  clid: `"MTS" <${did}>`,
  did,
  inboundDid: did,
  dst: 'Очередь 9000',
  answeredExts: ['201'],
  dcontext: 'ext-queues',
  disposition: 'ANSWERED'
}, []);
assert.equal(rowView.displayedSrc, externalCaller);
assert.equal(rowView.displayedDst, '201');
assert.notEqual(rowView.callerName, 'MTS');

const outboundRow = buildCdrRowViewModel({ src: '201', cnum: '201', dst: externalCaller, dcontext: 'from-internal', disposition: 'ANSWERED' }, []);
assert.equal(outboundRow.displayedSrc, '201');
assert.equal(outboundRow.displayedDst, externalCaller);

const internalRow = buildCdrRowViewModel({ src: '201', cnum: '201', dst: '200', dcontext: 'from-internal', disposition: 'ANSWERED' }, []);
assert.equal(internalRow.displayedSrc, '201');
assert.equal(internalRow.displayedDst, '200');

const liveIncomingSessions = normalizeInboundLiveSessionCallers([
  {
    channel: 'PJSIP/MTS-in-00001', context: 'from-trunk', exten: did, state: 'Ring',
    callerId: did, uniqueid: 'live-1.1', linkedid: 'live-1'
  },
  {
    channel: 'Local/9000@ext-queues-00002;1', context: 'ext-queues', exten: '9000', state: 'Ring',
    callerId: externalCaller, uniqueid: 'live-1.2', linkedid: 'live-1'
  },
  {
    channel: 'PJSIP/201-00003', context: 'ext-local', exten: '201', state: 'Ringing',
    callerId: externalCaller, uniqueid: 'live-1.3', linkedid: 'live-1'
  }
]);
assert.equal(liveIncomingSessions.length, 3);
assert.ok(liveIncomingSessions.some(session => String(session.state).toLowerCase().includes('ring')));
assert.ok(liveIncomingSessions.every(session => session.callerNumber === externalCaller));
assert.ok(liveIncomingSessions.every(session => session.callerId === externalCaller));
assert.ok(liveIncomingSessions.every(session => session.callerNumber !== did));

const legacyLiveCaller = resolveInboundLiveCaller([
  { caller: externalCaller, cid_num: '', src: '', did, dcontext: 'ext-queues', dst: '9000' }
], [did], [did]);
assert.equal(legacyLiveCaller.externalCallerNumber, '');
assert.equal(legacyLiveCaller.callerNumber, externalCaller);
assert.equal(legacyLiveCaller.fallbackSourceField, 'live.caller');

const enrichedBanner = normalizeLiveCallBannerPayload({
  active: true,
  direction: 'incoming',
  externalCallerNumber: externalCaller,
  callerNumber: did,
  number: did,
  did,
  externalCallerConfidence: 'high'
});
assert.equal(enrichedBanner?.callerNumber, externalCaller);
assert.equal(enrichedBanner?.number, externalCaller);
assert.equal(isLiveCallPopupVisible(enrichedBanner), true);

const unresolvedInboundBanner = normalizeLiveCallBannerPayload({
  active: true,
  direction: 'incoming',
  number: '',
  externalCallerNumber: '',
  externalCallerConfidence: 'none'
});
assert.equal(unresolvedInboundBanner?.number, '');
assert.equal(isLiveCallPopupVisible(unresolvedInboundBanner), true);
assert.equal(isLiveCallPopupVisible({ active: false, direction: 'incoming', number: externalCaller }), false);

console.log('Inbound caller resolver fixtures passed');
