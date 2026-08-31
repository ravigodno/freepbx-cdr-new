import assert from 'node:assert/strict';
import { resolveClickToCallOriginChannel } from '../server/clickToCallOrigin.js';

assert.equal(resolveClickToCallOriginChannel('PJSIP', '11'), 'PJSIP/11');
assert.equal(resolveClickToCallOriginChannel('SIP', '15'), 'SIP/15');
assert.equal(resolveClickToCallOriginChannel('PJSIP', '11', true), 'Local/*8011@from-internal/n');
assert.equal(resolveClickToCallOriginChannel('PJSIP', '11', true, '*81'), 'Local/*8111@from-internal/n');
assert.equal(resolveClickToCallOriginChannel('PJSIP', '11', true, '*80\r\nAction: Logoff'), 'Local/*8011@from-internal/n');
assert.equal(resolveClickToCallOriginChannel('PJSIP', 'bad', true), '');
console.log('click-to-call speakerphone origin: ok');
