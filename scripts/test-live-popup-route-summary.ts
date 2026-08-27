import assert from 'node:assert/strict';
import {
  buildCallRouteSummaryFromLivePayload,
  buildCallRouteSummaryFromTimeline,
  mapRouteSummaryToLivePopup
} from '../server/callRouteSummary.js';
import { detectLiveCallDirection } from '../server/liveCallDirection.js';
import { stabilizeLiveCallBannerPayload } from '../src/utils/liveCallBanner.js';

const queue9990 = buildCallRouteSummaryFromLivePayload({
  direction: 'incoming', externalCaller: '74994907209', trunk: '841282',
  inboundRoute: 'ANY', queue: '9990', answeredBy: '200', rows: []
});
assert.equal(queue9990.scenario, 'incoming_queue');
assert.equal(queue9990.direction, 'incoming');
assert.equal(queue9990.displayNumber, '74994907209');
assert.equal(queue9990.queue, '9990');
assert.equal(queue9990.answeredBy, '200');
assert.notEqual(queue9990.displayNumber, '9990');
assert.notEqual(queue9990.displayNumber, '841282');
assert.notEqual(queue9990.internalCaller, '841282');
assert.ok(queue9990.rejectedCandidates.some(item => item.value === '841282' && item.reason.includes('trunk/did/route')));
assert.ok(queue9990.rejectedCandidates.some(item => item.value === '9990' && item.reason.includes('queue')));

const queue9000 = buildCallRouteSummaryFromLivePayload({
  direction: 'incoming', externalCaller: '79789279880', trunk: '9891206012U8405',
  inboundRoute: 'ANY', queue: '9000', answeredBy: '200', rows: []
});
assert.equal(queue9000.scenario, 'incoming_queue');
assert.equal(queue9000.direction, 'incoming');
assert.equal(queue9000.displayNumber, '79789279880');
assert.equal(queue9000.queue, '9000');
assert.equal(queue9000.answeredBy, '200');
assert.notEqual(queue9000.displayNumber, '9000');
assert.notEqual(queue9000.internalCaller, '8405');
assert.ok(queue9000.rejectedCandidates.some(item => item.value === '8405' && item.reason.includes('trunk/route fragment')));

const ringingGroup = buildCallRouteSummaryFromLivePayload({
  direction: 'incoming', externalCaller: '79788101210', trunk: '79885090300', ringGroup: '9999',
  destinationNumber: '9999', rows: [
    { Channel: 'PJSIP/11-0001', Exten: '9999', ChannelStateDesc: 'Ringing', BridgeId: '' }
  ]
});
assert.equal(ringingGroup.ringGroup, '9999');
assert.equal(ringingGroup.answeredBy, '');
assert.equal(mapRouteSummaryToLivePopup(ringingGroup).destinationNumber, '9999');

const answeredGroup = buildCallRouteSummaryFromLivePayload({
  direction: 'incoming', externalCaller: '79788101210', trunk: '79885090300', ringGroup: '9999',
  destinationNumber: '9999', rows: [
    { Channel: 'PJSIP/15-0002', Exten: '9999', ChannelStateDesc: 'Up', BridgeId: 'bridge-1' }
  ]
});
assert.equal(answeredGroup.answeredBy, '15');
assert.equal(mapRouteSummaryToLivePopup(answeredGroup).destinationNumber, '15');

const internal = buildCallRouteSummaryFromLivePayload({
  direction: 'internal', internalCaller: '200', destinationNumber: '100', rows: []
});
assert.equal(internal.scenario, 'internal');
assert.equal(internal.direction, 'internal');
assert.equal(internal.displayNumber, '100');
assert.equal(internal.internalCaller, '200');

const followMe = buildCallRouteSummaryFromLivePayload({
  direction: 'internal', internalCaller: '200', destinationNumber: '100',
  followMeExternalTargets: ['79788101210'], rows: []
});
assert.equal(followMe.scenario, 'internal_followme');
assert.equal(followMe.displayNumber, '100');
assert.equal(followMe.internalCaller, '200');
assert.deepEqual(followMe.followMeExternalTargets, ['79788101210']);
assert.notEqual(followMe.displayNumber, '79788101210');

const outgoing = buildCallRouteSummaryFromLivePayload({
  direction: 'outgoing', internalCaller: '200', destinationNumber: '79788101210', rows: []
});
assert.equal(outgoing.scenario, 'outgoing');
assert.equal(outgoing.direction, 'outgoing');
assert.equal(outgoing.displayNumber, '79788101210');

const outgoingThroughInNamedTrunk = buildCallRouteSummaryFromLivePayload({
  direction: 'outgoing',
  internalCaller: '200',
  destinationNumber: '79788101210',
  displayNumber: '79788101210',
  rows: [{
    Channel: 'SIP/729455-in-00000036',
    Context: 'macro-dialout-trunk',
    Application: 'Dial',
    ApplicationData: 'SIP/729455-in/79788101210,300,Tb(func-apply-sipheaders^s^1,(1))'
  }]
});
assert.equal(outgoingThroughInNamedTrunk.direction, 'outgoing');
assert.equal(outgoingThroughInNamedTrunk.displayNumber, '79788101210');

const outgoingWithTechnicalRoute = detectLiveCallDirection([
  { Channel:'PJSIP/11-00000176',Context:'from-internal',CallerIDNum:'11',ConnectedLineNum:'300',Exten:'300',Application:'Dial',ApplicationData:'PJSIP/out-trunk/79788101210,300,T' },
  { Channel:'PJSIP/out-trunk-00000177',Context:'macro-dialout-trunk',CallerIDNum:'79781234300',ConnectedLineNum:'11',Exten:'79788101210',Application:'AppDial',ApplicationData:'(Outgoing Line)' }
], '11');
assert.deepEqual(outgoingWithTechnicalRoute,{direction:'outgoing',internalCaller:'11',destinationNumber:'79788101210',trunkNumber:'79781234300'});

const outgoingWithFreePbxTrunkDialContext = detectLiveCallDirection([
  { Channel:'PJSIP/11-00000083',Context:'trunk-dial-with-exten',CallerIDNum:'79885090300',ConnectedLineNum:'300',Exten:'89788101210',Application:'Dial',ApplicationData:'PJSIP/89788101210@79885090300,300,T' },
  { Channel:'PJSIP/79885090300-00000084',Context:'from-pstn',CallerIDNum:'89788101210',ConnectedLineNum:'11',Exten:'89788101210',Application:'AppDial',ApplicationData:'(Outgoing Line)' }
], '11');
assert.deepEqual(outgoingWithFreePbxTrunkDialContext,{direction:'outgoing',internalCaller:'11',destinationNumber:'79788101210',trunkNumber:'79885090300'});

const outgoingRinging={active:true,linkedid:'1787809616.176',scenario:'outgoing',direction:'outgoing',operatorExt:'11',callerNumber:'11',internalCaller:'11',sourceNumber:'11',destinationNumber:'79788101210',dialedNumber:'79788101210',targetNumber:'79788101210',displayNumber:'79788101210',number:'79788101210'};
const answeredTechnical={active:true,linkedid:'1787809616.176',scenario:'internal',direction:'internal',operatorExt:'11',callerNumber:'300',internalCaller:'300',sourceNumber:'300',destinationNumber:'11',targetNumber:'11',displayNumber:'11',number:'11',connected:true};
const stableAnswered=stabilizeLiveCallBannerPayload(outgoingRinging,answeredTechnical);
assert.equal(stableAnswered.direction,'outgoing');
assert.equal(stableAnswered.callerNumber,'11');
assert.equal(stableAnswered.destinationNumber,'79788101210');
assert.equal(stableAnswered.displayNumber,'79788101210');
assert.notEqual(stableAnswered.callerNumber,'300');

const meeting = buildCallRouteSummaryFromLivePayload({
  phoneMeeting: true, phoneMeetingInitiator: '200', queue: '9000', rows: []
});
assert.equal(meeting.scenario, 'meeting_new');
assert.equal(meeting.displayNumber, '200');
assert.deepEqual(mapRouteSummaryToLivePopup(meeting, { displayName: 'Телефонное совещание' }), {
  displayName: 'Телефонное совещание'
});

const chronologyQueue = buildCallRouteSummaryFromTimeline({
  externalCallerNumber: '74994907209', trunkNumber: '841282',
  timeline: [
    { src: '74994907209', dst: '9990', dcontext: 'ext-queues', lastapp: 'Queue', lastdata: '9990' },
    { src: '74994907209', dst: '200', dcontext: 'ext-local', dstchannel: 'PJSIP/200-00001', disposition: 'ANSWERED', billsec: 20 }
  ],
  routeAnalysis: {
    direction: 'inbound', answeredExt: '200',
    steps: [
      { type: 'inbound_trunk', number: '841282' },
      { type: 'inbound_route', number: 'ANY', destination: 'ext-queues,9990,1' },
      { type: 'queue', number: '9990' }
    ]
  }
});
assert.equal(chronologyQueue.scenario, 'incoming_queue');
assert.equal(chronologyQueue.displayNumber, '74994907209');
assert.equal(chronologyQueue.destinationLabel, 'Очередь 9990');

const consultOriginal = { ...queue9990, scenario: 'consult_transfer' as const };
const consultPopup = mapRouteSummaryToLivePopup(consultOriginal, { consultTarget: '299' });
assert.equal(consultPopup.displayNumber, '74994907209');
assert.equal(consultPopup.callerNumber, '74994907209');
assert.equal(consultPopup.consultTarget, undefined);

console.log('Live popup route summary fixtures passed');
