import assert from 'node:assert/strict';
import fs from 'node:fs';

const popup = fs.readFileSync('browser-extension/call-popup.js', 'utf8');
const html = fs.readFileSync('browser-extension/call-popup.html', 'utf8');
const worker = fs.readFileSync('browser-extension/service-worker.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync('browser-extension/manifest.json', 'utf8'));

assert.match(html, /id="blacklist"/);
assert.match(popup, /direction === 'incoming'/);
assert.match(popup, /callerNumber\.length >= 7/);
assert.match(popup, /blacklist-hangup/);
assert.match(popup, /\/preview/);
assert.match(popup, /\/apply/);
assert.match(worker, /buttons: \[\{ title: 'В ЧС и завершить' \}\]/);
assert.match(worker, /notifications\.onButtonClicked/);
assert.match(worker, /blacklist-hangup/);
assert.match(worker, /notifications\.update\(`call:\$\{config\.lastCallId\}`,[\s\S]*?buttons: \[\]/);
assert.equal(manifest.version, '0.1.25');

console.log('browser extension blacklist action: ok');
