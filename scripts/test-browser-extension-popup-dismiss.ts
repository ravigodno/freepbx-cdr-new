import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('browser-extension/service-worker.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('browser-extension/manifest.json', 'utf8'));

assert.match(worker, /dismissedCallPopupId/);
assert.match(worker, /if \(config\.dismissedCallPopupId === id\) return;/);
assert.match(worker, /programmaticPopupClosures/);
assert.match(worker, /windows\.onRemoved[\s\S]*?dismissedCallPopupId/);
assert.match(worker, /handleEndedCall[\s\S]*?remove\('dismissedCallPopupId'\)/);
assert.equal(manifest.version, '0.1.25');

console.log('browser extension popup dismiss: ok');
