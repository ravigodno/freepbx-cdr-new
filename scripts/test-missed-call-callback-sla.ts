import assert from 'node:assert/strict';
import {
  DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES,
  MAX_MISSED_CALL_CALLBACK_SLA_MINUTES,
  resolveMissedCallCallbackSlaMinutes
} from '../shared/missedCallCallbackSla.js';

assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaMinutes: 15 }), 15);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaMinutes: 0 }), 1);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaMinutes: '30' }), 30);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaHours: 24 }), 1440);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaHours: 0.5 }), 30);
assert.equal(resolveMissedCallCallbackSlaMinutes({}), DEFAULT_MISSED_CALL_CALLBACK_SLA_MINUTES);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaMinutes: 20000 }), MAX_MISSED_CALL_CALLBACK_SLA_MINUTES);
assert.equal(resolveMissedCallCallbackSlaMinutes({ missedCallCallbackSlaMinutes: 45, missedCallCallbackSlaHours: 24 }), 45);

console.log('Missed-call callback SLA minute fixtures passed');
