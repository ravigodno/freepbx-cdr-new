import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(app, /design: 'Дизайн'/);
assert.doesNotMatch(app, /settingsTab === 'design'/);
assert.doesNotMatch(app, /Брендирование и дизайн системы/);
assert.match(app, /settings\?\.customLogoUrl \|\| publicSettings\?\.customLogoUrl/);
assert.match(app, /settings\?\.customCopyright \|\| publicSettings\?\.customCopyright/);

console.log('settings design tab removal tests: OK');
