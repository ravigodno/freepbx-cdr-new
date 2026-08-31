import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveLiveCallEndPolicy } from '../src/utils/liveCallBanner.js';

await import('../browser-extension/call-lifecycle.js');
const extensionPolicy = (globalThis as any).PBXPulsCallLifecycle.resolveCallEndPolicy;

const cases = [
  { direction: 'outgoing', connected: false, outgoingForOperator: true, expected: { action: 'close', delayMs: 0 } },
  { direction: 'outgoing', connected: true, outgoingForOperator: true, expected: { action: 'close', delayMs: 0 } },
  { direction: 'incoming', connected: true, outgoingForOperator: false, expected: { action: 'close', delayMs: 60_000 } },
  { direction: 'incoming', connected: false, outgoingForOperator: false, expected: { action: 'keep', delayMs: null } },
  { direction: 'internal', connected: false, outgoingForOperator: false, expected: { action: 'keep', delayMs: null } },
  { direction: 'internal', connected: true, outgoingForOperator: false, expected: { action: 'close', delayMs: 60_000 } },
  { direction: 'internal', connected: false, outgoingForOperator: true, expected: { action: 'close', delayMs: 0 } }
] as const;

for (const item of cases) {
  assert.deepEqual(resolveLiveCallEndPolicy(item.direction, item.connected, 0, item.outgoingForOperator), item.expected);
  assert.deepEqual(extensionPolicy(item.direction, item.connected, item.outgoingForOperator), item.expected);
}

assert.deepEqual(resolveLiveCallEndPolicy('unknown', false, 12, false), { action: 'configured', delayMs: 12_000 });
const worker = fs.readFileSync('browser-extension/service-worker.js', 'utf8');
assert.match(worker, /async function handleEndedCall\(config\) \{\s+await closeCallPopupWindow\(config\);/);
assert.match(worker, /lastCallIsOutgoingForOperator/);
assert.match(worker, /if \(policy\.action === 'keep'\) \{[\s\S]*?return;\s+\}/);
const popupCloseFunction = worker.match(/async function closeCallPopupWindow[\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(popupCloseFunction, /chrome\.notifications\.clear/);
console.log('live call end policy: ok');
