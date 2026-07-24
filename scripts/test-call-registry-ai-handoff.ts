import assert from 'node:assert/strict';
import {
  aggregateAiHandoffLogicalCall,
  buildAiHandoffTimeline,
  getAiHandoffLogicalStatus,
  isAiHandoffTechnicalLeg,
  type AiHandoffMetadata
} from '../server/calls/aiHandoffLogicalCall.js';

const linkedid = '1784882549.46';
const legs = [
  { uniqueid: linkedid, linkedid, calldate: '2026-07-24 11:42:29', src: '200', dst: '205', dcontext: 'pbxpuls-ai', channel: 'PJSIP/200-a', dstchannel: 'AudioSocket/127.0.0.1:8092-x', lastapp: 'Stasis', lastdata: 'pbxpuls-ai-control,ai_extension:205', duration: 22, billsec: 18, disposition: 'ANSWERED', recordingfile: '' },
  { uniqueid: 'media-1', linkedid, calldate: '2026-07-24 11:42:29', src: '', dst: 's', dcontext: 'default', channel: 'AudioSocket/127.0.0.1:8092-x', dstchannel: '', lastapp: 'Stasis', lastdata: 'pbxpuls-ai-control,x', duration: 0, billsec: 0, disposition: 'ANSWERED', recordingfile: '' },
  { uniqueid: linkedid, linkedid, calldate: '2026-07-24 11:42:51', src: '200', dst: 'handoff-d6b5915c4605', dcontext: 'pbxpuls-ai-handoff', channel: 'PJSIP/200-a', dstchannel: 'Local/handoff-d6b5915c4605@pbxpuls-ai-handoff-target-x;1', lastapp: 'Dial', lastdata: 'Local/handoff-d6b5915c4605@pbxpuls-ai-handoff-target/n,20', duration: 7, billsec: 7, disposition: 'ANSWERED', recordingfile: '' },
  { uniqueid: 'target-1', linkedid, calldate: '2026-07-24 11:42:51', src: '200', dst: '299', dcontext: 'from-did-direct', channel: 'Local/handoff-d6b5915c4605@pbxpuls-ai-handoff-target-x;2', dstchannel: 'PJSIP/299-b', lastapp: 'Dial', lastdata: 'PJSIP/299', duration: 7, billsec: 3, disposition: 'ANSWERED', recordingfile: 'internal-299-200.wav' }
];

const metadata = (patch: Partial<AiHandoffMetadata> = {}): AiHandoffMetadata => ({
  handoffId: 3,
  voiceSessionId: 59,
  linkedid,
  aiExtension: '205',
  agentId: 1,
  agentName: 'AI Receptionist',
  agentVersionId: 20,
  destinationType: 'extension',
  destinationId: '299',
  destinationName: 'Extension 299',
  state: 'completed',
  dialStatus: 'ANSWER',
  outcome: 'transferred_to_human',
  requestedAt: '2026-07-24 11:42:51',
  announcementFinishedAt: '2026-07-24 11:42:51',
  dialingAt: '2026-07-24 11:42:51',
  answeredAt: '2026-07-24 11:42:55',
  endedAt: '2026-07-24 11:42:59',
  ...patch
});

const logical = aggregateAiHandoffLogicalCall(legs, metadata());
assert.ok(logical);
assert.equal(logical.linkedid, linkedid);
assert.equal(logical.src, '200');
assert.equal(logical.initialDestination, '205');
assert.equal(logical.finalDestination, '299');
assert.equal(logical.logicalStatus, 'human_handoff_answered');
assert.equal(logical.humanTalkDuration, 3);
assert.equal(logical.aiTalkDuration, 18);
assert.equal(logical.totalLogicalDuration, 30);
assert.equal(logical.recordingfile, 'internal-299-200.wav');
assert.equal(logical.technicalLegsCount, 3);
assert.equal(logical.missed, false);
assert.equal(logical.lost, false);
assert.equal(logical.processed, true);
assert.equal([logical].length, 1, 'один linkedid становится одной пользовательской строкой');
assert.ok(logical.technicalLegs.every(isAiHandoffTechnicalLeg));
assert.ok(!String(logical.dst).includes('handoff-'));

const timeline = buildAiHandoffTimeline(legs, metadata());
assert.equal(timeline.events.length, 6);
assert.ok(timeline.events.some((event: any) => event.type === 'handoff_answered'));
assert.equal(timeline.technicalEvents.length, 4);

assert.equal(getAiHandoffLogicalStatus(metadata({ state: 'no_answer', dialStatus: 'NOANSWER', outcome: null })), 'human_handoff_no_answer');
assert.equal(getAiHandoffLogicalStatus(metadata({ state: 'returned', dialStatus: 'NOANSWER', outcome: 'returned_to_ai' })), 'human_handoff_returned_to_ai');
assert.equal(getAiHandoffLogicalStatus(metadata({ state: 'returned', dialStatus: 'BUSY', outcome: 'returned_to_ai' })), 'human_handoff_returned_to_ai');
assert.equal(getAiHandoffLogicalStatus(metadata({ state: 'failed', dialStatus: 'CHANUNAVAIL', outcome: null })), 'human_handoff_failed');
assert.equal(getAiHandoffLogicalStatus(metadata({ state: 'declined', dialStatus: null, outcome: 'declined' })), 'human_handoff_declined');

const aiOnly = aggregateAiHandoffLogicalCall([legs[0]], metadata({ destinationId: '299' }));
assert.ok(aiOnly, 'AI metadata keeps the logical call even when a late CDR leg is unavailable');
assert.equal(aggregateAiHandoffLogicalCall([{ ...legs[0], dcontext: 'from-internal', lastdata: '', dst: '201' }], metadata()), null, 'обычный звонок не получает AI aggregation');

for (const destinationType of ['queue', 'ring_group']) {
  const row = aggregateAiHandoffLogicalCall(legs, metadata({ destinationType, destinationName: `${destinationType} 299` }));
  assert.equal(row?.handoffDestinationType, destinationType);
  assert.equal(row?.finalDestination, '299');
}

const attempts = [metadata({ handoffId: 2, state: 'failed', dialStatus: 'NOANSWER' }), metadata({ handoffId: 3 })];
assert.equal(getAiHandoffLogicalStatus(attempts.at(-1)!), 'human_handoff_answered', 'последняя попытка определяет итог');

const continuousRecordingLegs = legs.map((leg, index) => index === 0
  ? { ...leg, recordingfile: `ai-${linkedid}.wav` }
  : leg
);
const continuouslyRecorded = aggregateAiHandoffLogicalCall(continuousRecordingLegs, metadata());
assert.equal(
  continuouslyRecorded?.recordingfile,
  `ai-${linkedid}.wav`,
  'единая запись исходного caller channel имеет приоритет над отдельной записью destination'
);

console.log('AI handoff logical call registry tests passed');
