import assert from 'node:assert/strict';
import { calculateServerClockOffset } from '../src/utils/serverClock';

const DAY_MS = 24 * 60 * 60 * 1000;
const serverTimeMs = Date.parse('2026-07-20T09:00:00.000Z');

const clientThreeDaysBehind = serverTimeMs - 3 * DAY_MS;
assert.equal(
  calculateServerClockOffset(serverTimeMs, clientThreeDaysBehind - 50, clientThreeDaysBehind + 50),
  3 * DAY_MS,
  'three-day-behind client must receive a positive correction'
);

const clientTwoDaysAhead = serverTimeMs + 2 * DAY_MS;
assert.equal(
  calculateServerClockOffset(serverTimeMs, clientTwoDaysAhead - 100, clientTwoDaysAhead + 100),
  -2 * DAY_MS,
  'two-day-ahead client must receive a negative correction'
);

assert.equal(
  calculateServerClockOffset(serverTimeMs, serverTimeMs - 400, serverTimeMs + 600),
  -100,
  'network delay must be compensated using the request midpoint'
);

assert.throws(() => calculateServerClockOffset('invalid', serverTimeMs, serverTimeMs + 1), /invalid time/i);
assert.throws(
  () => calculateServerClockOffset(serverTimeMs, serverTimeMs + 1, serverTimeMs),
  /invalid server clock synchronization interval/i
);

console.log('server clock tests: ok');
