import assert from 'node:assert/strict';
import fs from 'node:fs';

const dialer = fs.readFileSync(new URL('../src/modules/softphone/components/UnifiedDialer.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const preferences = fs.readFileSync(new URL('../src/utils/interfacePreferences.ts', import.meta.url), 'utf8');

assert.doesNotMatch(dialer, /onModeChange|Спрашивать/);
assert.doesNotMatch(app, /<option value="ask">/);
assert.match(preferences, /next\.callDeviceMode === 'browser_headset' \? 'browser_headset' : 'desk_phone'/);
assert.match(dialer, /const headsetSelected = mode === 'browser_headset'/);

console.log('unified dialer settings tests: OK');
