import assert from 'node:assert/strict';
import { buildOutboundDtmfSequences, type DtmfEventRecord } from '../server/dtmfEventStorage.js';

const event = (seconds: number, digit: string, overrides: Partial<DtmfEventRecord> = {}): DtmfEventRecord => ({
  ts: new Date(Date.parse('2026-09-03T10:00:00.000Z') + seconds * 1000).toISOString(),
  linkedid: 'call-1',
  uniqueid: 'leg-1',
  channel: 'PJSIP/123-00000001',
  digit,
  direction: 'Received',
  event: 'DTMFEnd',
  ...overrides
});

const sequences = buildOutboundDtmfSequences(
  [
    event(-1, '9'),
    event(2, '1'),
    event(3, '2'),
    event(4, '3'),
    event(8, '#'),
    event(9, '7', { direction: 'Sent' }),
    event(10, '8', { channel: 'PJSIP/trunk-00000002' })
  ],
  '123',
  new Date('2026-09-03T10:00:00.000Z'),
  new Date('2026-09-03T10:01:00.000Z')
);

assert.deepEqual(sequences.map(sequence => sequence.digits), ['123', '#']);
assert.equal(sequences[0].offsetSeconds, 2);
assert.equal(buildOutboundDtmfSequences([event(2, '1')], '', new Date(), new Date()).length, 0);

console.log('outbound DTMF tests: OK');
