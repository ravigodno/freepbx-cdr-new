import assert from 'node:assert/strict';
import { isPBXPulsDbConnectivityError } from '../server/pbxpulsDb.js';

assert.equal(isPBXPulsDbConnectivityError({ code: 'ECONNREFUSED' }), true);
assert.equal(isPBXPulsDbConnectivityError({ code: 'PROTOCOL_CONNECTION_LOST' }), true);
assert.equal(isPBXPulsDbConnectivityError({ code: 'ER_ACCESS_DENIED_ERROR' }), true);
assert.equal(isPBXPulsDbConnectivityError({ code: 'ER_DUP_ENTRY' }), false);
assert.equal(isPBXPulsDbConnectivityError({ code: 'ER_BAD_NULL_ERROR' }), false);
assert.equal(isPBXPulsDbConnectivityError(new Error('business query failed')), false);

console.log('PBXPuls DB circuit breaker classification tests: OK');
