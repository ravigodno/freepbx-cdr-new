import assert from 'node:assert/strict';
import { CONFERENCE_CONTEXTS, hasLoadedConferenceContext } from '../server/conferenceReadiness.js';
for (const context of CONFERENCE_CONTEXTS) {
  const message = `[ Context '${context}' created by 'pbx_config' ]\n  '_X!' => 1. NoOp(test)\n  2. ConfBridge(9123456789)`;
  assert.equal(hasLoadedConferenceContext(context, { success: true, message }), true);
  assert.equal(hasLoadedConferenceContext(context, { success: true, message: `\x1b[1;35m${message}\x1b[0m` }), true);
  assert.equal(hasLoadedConferenceContext(context, { success: false, message }), false);
  assert.equal(hasLoadedConferenceContext(context, { success: true, message: `There is no existence of '${context}' context` }), false);
  assert.equal(hasLoadedConferenceContext(context, { success: true, message: message.replace('ConfBridge(', 'Hangup(') }), false);
  assert.equal(hasLoadedConferenceContext(context, { success: true, message: message.replace(context, 'other-context') }), false);
}
console.log('Conference readiness: passed');
