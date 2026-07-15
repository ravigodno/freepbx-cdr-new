import assert from 'node:assert/strict';
import {
  buildCallRouteSummaryFromLivePayload,
  buildCallRouteSummaryFromTimeline,
  mapRouteSummaryToLivePopup
} from '../server/callRouteSummary.js';

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
