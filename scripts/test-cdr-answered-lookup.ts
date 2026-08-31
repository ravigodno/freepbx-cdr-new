import assert from 'node:assert/strict';
import { buildAnsweredContactLookup, findFirstAnsweredContactAfter } from '../server/cdrAnsweredLookup.js';

const calls = [
  { uniqueid: 'missed', calldate: '2026-01-01 10:00:00', src: '79780000000', dst: '100', disposition: 'NO ANSWER', billsec: 0 },
  { uniqueid: 'later', calldate: '2026-01-01 10:20:00', src: '100', dst: '79780000000', disposition: 'ANSWERED', billsec: 30 },
  { uniqueid: 'first', calldate: '2026-01-01 10:05:00', src: '79780000000', dst: '101', disposition: 'ANSWERED', billsec: 20 },
  { uniqueid: 'empty', calldate: '2026-01-01 10:01:00', src: '100', dst: '79780000000', disposition: 'ANSWERED', billsec: 0 },
];

const lookup = buildAnsweredContactLookup(calls);
assert.equal(findFirstAnsweredContactAfter(lookup, '79780000000', new Date('2026-01-01T10:00:00').getTime())?.uniqueid, 'first');
assert.equal(findFirstAnsweredContactAfter(lookup, '79780000000', new Date('2026-01-01T10:05:00').getTime())?.uniqueid, 'later');
assert.equal(findFirstAnsweredContactAfter(lookup, '70000000000', 0), null);

console.log(JSON.stringify({ ok: true, indexedAnsweredLookup: true }));
