import assert from 'node:assert/strict';
import {
  mergeLiveSessionAmiEvidence,
  normalizeLiveSessionCallers,
  resolveInboundExternalCaller,
  resolveInboundLiveCaller,
  selectIncomingCallerEvidence
} from '../server/inboundCallerResolver.js';
import {
  detectLiveCallDirection,
  selectLiveOutgoingDestination,
  stripLiveTechnicalAddresses
} from '../server/liveCallDirection.js';
import { buildCallRouteView } from '../src/modules/cdr/utils/buildCallRouteView.js';
import { buildCdrRowViewModel } from '../src/modules/cdr/utils/CDRRowHelpers.js';
import {
  buildLiveCallBannerDisplay,
  getLiveCallPopupTitle,
  isLiveCallPopupVisible,
  normalizeLiveCallBannerPayload
} from '../src/utils/liveCallBanner.js';

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

const liveIncomingFixture = [
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
];
const liveIncomingDirection = detectLiveCallDirection(liveIncomingFixture, '201');
assert.equal(liveIncomingDirection.direction, 'incoming');
assert.equal(liveIncomingDirection.destinationNumber, '9000');
const liveIncomingSessions = normalizeLiveSessionCallers(liveIncomingFixture);
assert.equal(liveIncomingSessions.length, 3);
assert.ok(liveIncomingSessions.some(session => String(session.state).toLowerCase().includes('ring')));
assert.ok(liveIncomingSessions.every(session => session.callerNumber === externalCaller));
assert.ok(liveIncomingSessions.every(session => session.callerId === externalCaller));
assert.ok(liveIncomingSessions.every(session => session.callerNumber !== did));
assert.ok(liveIncomingSessions.every(session => session.direction === 'incoming'));

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
assert.equal(getLiveCallPopupTitle(enrichedBanner?.direction), 'Входящий звонок');

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

const outboundDestination = '79788101210';
const outboundTrunkNumber = '74994907209';
const liveOutgoingFixture = [
  {
    Channel: 'PJSIP/200-00010', Context: 'from-internal', Exten: outboundDestination,
    CallerIDNum: '200', ConnectedLineNum: outboundDestination, ApplicationData: `PJSIP/${outboundDestination}@MTS-in`,
    Uniqueid: 'live-2.1', Linkedid: 'live-2'
  },
  {
    Channel: 'PJSIP/MTS-in-00011', Context: 'macro-dialout-trunk', Exten: outboundDestination,
    CallerIDNum: outboundTrunkNumber, ConnectedLineNum: outboundDestination,
    Uniqueid: 'live-2.2', Linkedid: 'live-2'
  }
];
const liveOutgoingDirection = detectLiveCallDirection(liveOutgoingFixture, '200');
assert.deepEqual(liveOutgoingDirection, {
  direction: 'outgoing',
  internalCaller: '200',
  destinationNumber: outboundDestination,
  trunkNumber: outboundTrunkNumber
});
const liveOutgoingSessions = normalizeLiveSessionCallers(liveOutgoingFixture.map(channel => ({
  channel: channel.Channel,
  context: channel.Context,
  exten: channel.Exten,
  callerId: channel.CallerIDNum,
  appData: channel.ApplicationData,
  uniqueid: channel.Uniqueid,
  linkedid: channel.Linkedid
})));
assert.ok(liveOutgoingSessions.every(session => session.direction === 'outgoing'));
assert.ok(liveOutgoingSessions.every(session => session.callerNumber === '200'));
assert.ok(liveOutgoingSessions.every(session => session.destinationNumber === outboundDestination));
assert.ok(liveOutgoingSessions.every(session => session.trunkNumber === outboundTrunkNumber));
const outgoingBanner = normalizeLiveCallBannerPayload({
  active: true,
  direction: liveOutgoingDirection.direction,
  operatorExt: '200',
  internalCaller: liveOutgoingDirection.internalCaller,
  callerNumber: liveOutgoingDirection.internalCaller,
  destinationNumber: liveOutgoingDirection.destinationNumber,
  number: liveOutgoingDirection.destinationNumber,
  trunkNumber: liveOutgoingDirection.trunkNumber
});
assert.equal(outgoingBanner?.direction, 'outgoing');
assert.equal(outgoingBanner?.callerNumber, '200');
assert.equal(outgoingBanner?.number, outboundDestination);
assert.equal(outgoingBanner?.destinationNumber, outboundDestination);
assert.equal(outgoingBanner?.trunkNumber, outboundTrunkNumber);
assert.equal(getLiveCallPopupTitle(outgoingBanner?.direction), 'Исходящий звонок');
assert.equal(isLiveCallPopupVisible(outgoingBanner), true);

const liveInternalFixture = [
  {
    Channel: 'PJSIP/200-00020', Context: 'from-internal', Exten: '100',
    CallerIDNum: '200', ConnectedLineNum: '100', ApplicationData: 'PJSIP/100-00021',
    Uniqueid: 'live-3.1', Linkedid: 'live-3'
  },
  {
    Channel: 'PJSIP/100-00021', Context: 'from-internal', Exten: '100',
    CallerIDNum: '200', ConnectedLineNum: '100',
    Uniqueid: 'live-3.2', Linkedid: 'live-3'
  }
];
const liveInternalDirection = detectLiveCallDirection(liveInternalFixture, '200');
assert.equal(liveInternalDirection.direction, 'internal');
assert.equal(liveInternalDirection.internalCaller, '200');
assert.equal(liveInternalDirection.destinationNumber, '100');
const liveInternalSessions = normalizeLiveSessionCallers(liveInternalFixture.map(channel => ({
  channel: channel.Channel,
  context: channel.Context,
  exten: channel.Exten,
  callerId: channel.CallerIDNum,
  appData: channel.ApplicationData,
  uniqueid: channel.Uniqueid,
  linkedid: channel.Linkedid
})));
assert.ok(liveInternalSessions.every(session => session.direction === 'internal'));
assert.ok(liveInternalSessions.every(session => session.callerNumber === '200'));
assert.ok(liveInternalSessions.every(session => session.destinationNumber === '100'));
const internalBanner = normalizeLiveCallBannerPayload({ active: true, ...liveInternalDirection, callerNumber: '200', number: '100' });
assert.equal(internalBanner?.callerNumber, '200');
assert.equal(internalBanner?.number, '100');
assert.equal(getLiveCallPopupTitle(internalBanner?.direction), 'Внутренний звонок');

const outboundRouteView = buildCallRouteView({
  timeline: [
    { src: '200', cnum: '200', dst: outboundDestination, dcontext: 'from-internal', channel: 'PJSIP/200-00010', disposition: 'ANSWERED', billsec: 30 }
  ],
  trunkNumber: outboundTrunkNumber,
  routeAnalysis: {
    direction: 'outbound',
    steps: [
      { type: 'outbound_route', title: 'Исходящие правила', destination: outboundDestination },
      { type: 'outbound_trunk', title: 'MTS', number: outboundTrunkNumber, details: { trunks: [{ name: 'MTS', channelid: 'MTS-in', outcid: outboundTrunkNumber }] } }
    ]
  }
});
assert.deepEqual(outboundRouteView.routeSteps.map(step => step.label), ['EXTENSION', 'OUTBOUND ROUTE', 'TRUNK']);
assert.match(outboundRouteView.resultText, /ответил/i);

// Реальная форма UID 1783942903.61: исходящий транк содержит `-in` и
// context `from-trunk-*`, но origin PJSIP/200 + from-internal остаётся приоритетным.
const realOutboundDirection = detectLiveCallDirection([
  {
    Channel: 'PJSIP/200-00000012', Context: 'from-internal', Exten: outboundDestination,
    CallerIDNum: '200', ConnectedLineNum: outboundDestination,
    ApplicationData: `SIP/841282-in/${outboundDestination},300`
  },
  {
    Channel: 'SIP/841282-in-00000011', Context: 'from-trunk-sip-841282-in', Exten: outboundDestination,
    CallerIDNum: '841282', ConnectedLineNum: outboundDestination
  }
], '200');
assert.deepEqual(realOutboundDirection, {
  direction: 'outgoing',
  internalCaller: '200',
  destinationNumber: outboundDestination,
  trunkNumber: '841282'
});
assert.equal(
  selectLiveOutgoingDestination({ ...realOutboundDirection, destinationNumber: '200' }, ['200', '841282', outboundDestination]),
  outboundDestination
);

// Реальный active payload, снятый 2026-07-13 во время UID 1783947281.101.
// На PJSIP leg CallerIDNum уже заменён outbound CID транка, поэтому источник
// доказывается каналом PJSIP/200 + outbound context, а не operatorExt из UI.
const capturedOutgoingAmi = [
  {
    Channel: 'SIP/841282-in-00000025', Context: 'func-apply-sipheaders', Exten: 's',
    ChannelStateDesc: 'Down', CallerIDNum: outboundDestination, ConnectedLineNum: '',
    Application: 'Return', ApplicationData: '', Uniqueid: '1783947283.102', Linkedid: '1783947281.101'
  },
  {
    Channel: 'PJSIP/200-00000026', Context: 'macro-dialout-trunk', Exten: 's',
    ChannelStateDesc: 'Ring', CallerIDNum: '841282', ConnectedLineNum: outboundDestination,
    Application: 'Dial',
    ApplicationData: `SIP/841282-in/${outboundDestination},300,Tb(func-apply-sipheaders^s^1,(1))`,
    Uniqueid: '1783947281.101', Linkedid: '1783947281.101'
  }
];
assert.deepEqual(detectLiveCallDirection(capturedOutgoingAmi, '200'), {
  direction: 'outgoing', internalCaller: '200', destinationNumber: outboundDestination, trunkNumber: '841282'
});

// Реальный active payload, снятый 2026-07-13 во время UID 1783947336.103.
// FreePBX уже перевёл trunk leg в macro-dial-one, но SIP/<trunk>-in-* остаётся
// фактическим признаком входящего звонка.
const capturedIncomingAmi = [
  {
    Channel: 'SIP/841282-in-00000026', Context: 'macro-dial-one', Exten: 's',
    ChannelStateDesc: 'Up', CallerIDNum: '74993017671', ConnectedLineNum: '',
    Application: 'Dial', ApplicationData: 'PJSIP/200/sip:200@192.168.1.222:5060,,HhtrI',
    Uniqueid: '1783947336.103', Linkedid: '1783947336.103'
  },
  {
    Channel: 'PJSIP/200-00000027', Context: 'from-internal', Exten: '',
    ChannelStateDesc: 'Up', CallerIDNum: '200', ConnectedLineNum: '74993017671',
    Application: 'AppDial', ApplicationData: '(Outgoing Line)',
    Uniqueid: '1783947336.104', Linkedid: '1783947336.103'
  }
];
assert.deepEqual(detectLiveCallDirection(capturedIncomingAmi, '200'), {
  direction: 'incoming', internalCaller: '', destinationNumber: '200', trunkNumber: '841282'
});
const capturedIncomingSessions = normalizeLiveSessionCallers(mergeLiveSessionAmiEvidence([
  {
    channel: 'SIP/841282-in-00000026', context: 'macro-dial-one', exten: 's', state: 'Up',
    application: 'Dial', appData: 'PJSIP/200/sip:200@192.168.1.222:5060,,HhtrI',
    callerId: '74993017671', uniqueid: '1783947336.103', linkedid: ''
  },
  {
    channel: 'PJSIP/200-00000027', context: 'from-internal', exten: '', state: 'Up',
    application: 'AppDial', appData: '(Outgoing Line)', callerId: '200',
    uniqueid: '1783947336.104', linkedid: ''
  }
], capturedIncomingAmi));
assert.equal(capturedIncomingSessions.length, 2);
assert.ok(capturedIncomingSessions.every(session => session.linkedid === '1783947336.103'));
assert.ok(capturedIncomingSessions.every(session => session.direction === 'incoming'));
assert.ok(capturedIncomingSessions.every(session => session.callerNumber === '74993017671'));

// Реальный CEL CHAN_START UID 1783942893.55 (200 -> 100).
const capturedInternalCel = [{
  eventtype: 'CHAN_START', cid_name: '200', cid_num: '200', exten: '100',
  context: 'from-internal', appname: '', channame: 'PJSIP/200-00000011',
  uniqueid: '1783942893.55', linkedid: '1783942893.55'
}];
assert.deepEqual(detectLiveCallDirection(capturedInternalCel, '999'), {
  direction: 'internal', internalCaller: '200', destinationNumber: '100', trunkNumber: ''
});

const guardedOutgoingBanner = normalizeLiveCallBannerPayload({
  active: true,
  direction: 'outgoing',
  internalCaller: '200',
  callerNumber: '200',
  dialedNumber: outboundDestination,
  destinationNumber: '200',
  number: '200',
  trunkNumber: '841282'
});
assert.equal(guardedOutgoingBanner?.callerNumber, '200');
assert.equal(guardedOutgoingBanner?.destinationNumber, outboundDestination);
assert.equal(guardedOutgoingBanner?.number, outboundDestination);

const inboundWithSipContact = [
  {
    Channel: 'SIP/841282-in-00000015', Context: 'from-trunk-sip-841282-in', Exten: '841282',
    CallerIDNum: '74994907209', ConnectedLineNum: '200'
  },
  {
    Channel: 'PJSIP/200-00000016', Context: 'ext-local', Exten: '200',
    CallerIDNum: '74994907209', ConnectedLineNum: '200',
    ApplicationData: 'PJSIP/200/sip:200@192.168.1.222:5060,,HhtrI'
  }
];
const sanitizedSipContact = stripLiveTechnicalAddresses(inboundWithSipContact[1].ApplicationData);
assert.doesNotMatch(sanitizedSipContact, /192|168|222|5060/);
const inboundSipContactDirection = detectLiveCallDirection(inboundWithSipContact, '200');
assert.equal(inboundSipContactDirection.direction, 'incoming');
assert.equal(inboundSipContactDirection.destinationNumber, '200');

const liveCelOnlyFallback = resolveInboundExternalCaller([], [
  {
    eventtype: 'CHAN_START', cid_name: 'РА Выгодно', cid_num: '74994907209',
    exten: '841282', context: 'from-trunk-sip-841282-in', channame: 'SIP/841282-in-0000001a'
  },
  {
    eventtype: 'CHAN_START', cid_name: '200', cid_num: '200',
    exten: 's', context: 'from-internal', channame: 'PJSIP/200-0000001b'
  }
]);
assert.equal(liveCelOnlyFallback.externalCallerNumber, '74994907209');
assert.equal(liveCelOnlyFallback.sourceField, 'cel.cid_num');
assert.notEqual(liveCelOnlyFallback.externalCallerNumber, '841282');

const debianEvidence = selectIncomingCallerEvidence({
  chronologyExternalCallerNumber: '79789279880',
  celRows: [{ cid_num: '79789279880', exten: '9000', context: 'ext-queues' }],
  cdrRows: [{ src: '79789279880', cnum: '79789279880', clid: '"Client" <79789279880>', dst: '9000', did: '9891206012', dcontext: 'ext-queues' }],
  amiRows: [{ CallerIDNum: '9000', ConnectedLineNum: '200' }],
  technicalCandidates: ['9891206012', '9000']
});
assert.equal(debianEvidence.externalCallerNumber, '79789279880');
assert.equal(debianEvidence.selectedReason, 'chronology');
assert.equal(debianEvidence.sourceField, 'chronology.externalCallerNumber');

const centosEvidence = selectIncomingCallerEvidence({
  amiRows: [{ CallerIDNum: '74994907209', ConnectedLineNum: '200' }],
  technicalCandidates: ['841282']
});
assert.equal(centosEvidence.externalCallerNumber, '74994907209');
assert.equal(centosEvidence.selectedReason, 'ami.CallerIDNum');
assert.equal(centosEvidence.sourceField, 'ami.CallerIDNum');

const incomingDisplay = buildLiveCallBannerDisplay({
  direction: 'incoming',
  externalCallerNumber: externalCaller,
  callerNumber: externalCaller,
  destinationNumber: '201',
  operatorExt: '201',
  did
});
assert.equal(incomingDisplay.displayNumber, externalCaller);
assert.equal(incomingDisplay.subtitle, '');

const capturedIncomingDisplay = buildLiveCallBannerDisplay({
  direction: 'incoming', operatorExt: '200', externalCallerNumber: '74993017671',
  sourceNumber: '74993017671', callerNumber: '74993017671', destinationNumber: '200',
  internalNumber: '200', did: '841282', trunkNumber: '841282', displayName: 'РА Выгодно'
});
assert.equal(capturedIncomingDisplay.displayNumber, '74993017671');
assert.equal(capturedIncomingDisplay.callerNumber, '74993017671');
assert.equal(capturedIncomingDisplay.subtitle, '74993017671');

const outgoingDisplay = buildLiveCallBannerDisplay({
  direction: 'outgoing',
  callerNumber: '200',
  internalCaller: '200',
  dialedNumber: outboundDestination,
  destinationNumber: outboundDestination,
  trunkNumber: '841282'
});
assert.equal(outgoingDisplay.displayNumber, outboundDestination);
assert.equal(outgoingDisplay.subtitle, '');

const namedOutgoingDisplay = buildLiveCallBannerDisplay({
  direction: 'outgoing', callerNumber: '200', internalCaller: '200',
  dialedNumber: outboundDestination, destinationNumber: outboundDestination,
  trunkNumber: '841282', displayName: 'Грунин К.В.'
});
assert.equal(namedOutgoingDisplay.displayName, 'Грунин К.В.');
assert.equal(namedOutgoingDisplay.subtitle, outboundDestination);

const unprovenOutgoingSource = buildLiveCallBannerDisplay({
  direction: 'outgoing', operatorExt: '200', dialedNumber: outboundDestination,
  destinationNumber: outboundDestination, trunkNumber: '841282'
});
assert.equal(unprovenOutgoingSource.displayNumber, outboundDestination);
assert.equal(unprovenOutgoingSource.callerNumber, '');
assert.equal(unprovenOutgoingSource.subtitle, '');

const internalDisplay = buildLiveCallBannerDisplay({
  direction: 'internal',
  callerNumber: '200',
  internalCaller: '200',
  targetNumber: '100',
  extension: '100'
});
assert.equal(internalDisplay.displayNumber, '100');
assert.notEqual(internalDisplay.displayNumber, '');
assert.equal(internalDisplay.subtitle, 'От внутреннего 200');

const unprovenInternalSource = buildLiveCallBannerDisplay({
  direction: 'internal', operatorExt: '200', destinationNumber: '100'
});
assert.equal(unprovenInternalSource.displayNumber, '100');
assert.equal(unprovenInternalSource.callerNumber, '');
assert.equal(unprovenInternalSource.subtitle, 'Внутренний звонок');

const namedInternalDisplay = buildLiveCallBannerDisplay({
  direction: 'internal',
  callerId: '200',
  destinationNumber: '100',
  displayName: 'Приёмная'
});
assert.equal(namedInternalDisplay.displayName, 'Приёмная');
assert.equal(namedInternalDisplay.displayNumber, '100');
assert.equal(namedInternalDisplay.subtitle, '100 · От внутреннего 200');

const internalCelDirection = detectLiveCallDirection([
  { cid_num: '200', exten: '100', context: 'from-internal', channame: 'PJSIP/200-00000100' },
  { cid_num: '200', exten: '100', context: 'from-internal', channame: 'PJSIP/100-00000101' }
], '200');
assert.equal(internalCelDirection.direction, 'internal');
assert.equal(internalCelDirection.internalCaller, '200');
assert.equal(internalCelDirection.destinationNumber, '100');

const outgoingCelDirection = detectLiveCallDirection([
  { cid_num: '200', exten: outboundDestination, context: 'from-internal', channame: 'PJSIP/200-00000102' },
  { cid_num: '841282', exten: outboundDestination, context: 'from-trunk-sip-841282-in', channame: 'SIP/841282-in-00000103' }
], '200');
assert.equal(outgoingCelDirection.direction, 'outgoing');
assert.equal(outgoingCelDirection.internalCaller, '200');
assert.equal(outgoingCelDirection.destinationNumber, outboundDestination);

console.log('Inbound caller resolver fixtures passed');
