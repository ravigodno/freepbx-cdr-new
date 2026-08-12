import assert from 'node:assert/strict';
import {
  clearClickToCallLiveIntent,
  getClickToCallLiveIntent,
  markClickToCallLiveIntentActive,
  rememberClickToCallLiveIntent
} from '../server/clickToCallLiveIntent.js';

const now = Date.now();
assert.equal(rememberClickToCallLiveIntent('bad', '79788101210', now), null);
assert.equal(rememberClickToCallLiveIntent('200', 'short', now), null);

const intent = rememberClickToCallLiveIntent('200', '+7 (978) 810-12-10', now);
assert.equal(intent?.fromExtension, '200');
assert.equal(intent?.destinationNumber, '79788101210');
assert.equal(getClickToCallLiveIntent('200', now + 10)?.destinationNumber, '79788101210');
markClickToCallLiveIntentActive('200');
assert.equal(getClickToCallLiveIntent('200', now + 10)?.seenActive, true);
assert.equal(getClickToCallLiveIntent('200', now + 90_001), null);

rememberClickToCallLiveIntent('200', '79788101210', now);
rememberClickToCallLiveIntent('201', '74951234567', now);
assert.equal(getClickToCallLiveIntent('200', now)?.destinationNumber, '79788101210');
assert.equal(getClickToCallLiveIntent('201', now)?.destinationNumber, '74951234567');
rememberClickToCallLiveIntent('200', '78121234567', now + 20);
assert.equal(getClickToCallLiveIntent('200', now + 20)?.destinationNumber, '78121234567');
clearClickToCallLiveIntent('200');
assert.equal(getClickToCallLiveIntent('200', now), null);
assert.equal(getClickToCallLiveIntent('201', now)?.destinationNumber, '74951234567');
clearClickToCallLiveIntent('201');

console.log('Click-to-call live intent fixtures passed');
