import assert from 'node:assert/strict';
import { resolveClickToCallContext } from '../server/clickToCallContext.js';

assert.equal(resolveClickToCallContext('from-internal', undefined), 'from-internal');
assert.equal(resolveClickToCallContext('from-internal', 'custom-click2call'), 'custom-click2call');
assert.equal(resolveClickToCallContext('', undefined), 'from-internal');
assert.equal(resolveClickToCallContext('from-internal', 'bad context\r\nAction: Logoff'), 'from-internal');

console.log('Click-to-call context fixtures passed');
