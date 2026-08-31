import assert from 'node:assert/strict';
import { canBlacklistLiveIncomingCall, getLiveCallBlacklistNumber } from '../src/utils/liveCallBlacklist.js';

assert.equal(canBlacklistLiveIncomingCall({ active: true, direction: 'incoming', externalCallerNumber: '+7 (978) 810-12-10' }), true);
assert.equal(getLiveCallBlacklistNumber({ active: true, direction: 'incoming', externalCallerNumber: '+7 (978) 810-12-10' }), '79788101210');
assert.equal(canBlacklistLiveIncomingCall({ active: true, direction: 'incoming', callerNumber: '11' }), false);
assert.equal(canBlacklistLiveIncomingCall({ active: true, direction: 'internal', callerNumber: '12' }), false);
assert.equal(canBlacklistLiveIncomingCall({ active: true, direction: 'outgoing', callerNumber: '11', externalCallerNumber: '79788101210' }), false);
assert.equal(canBlacklistLiveIncomingCall({ active: false, direction: 'incoming', externalCallerNumber: '79788101210' }), false);

console.log('live call blacklist eligibility: ok');
