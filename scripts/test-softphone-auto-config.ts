import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSoftphoneAutoConfig, resolveSoftphonePbxHost } from '../server/softphone/autoConfig.js';
import { SoftphoneCredentialCrypto } from '../server/softphone/credentialCrypto.js';

const ready = buildSoftphoneAutoConfig({
  username: 'operator',
  extension: '11',
  displayName: 'Operator 11',
  pbxHost: '192.168.1.2',
  deviceTech: 'pjsip',
  pjsip: { webrtc: 'yes', secret: 'test-secret', username: '73652500800' }
});
assert.equal(ready.ready, true);
assert.equal(ready.profile.websocketUrl, 'wss://192.168.1.2:8089/ws');
assert.equal(ready.profile.sipUri, 'sip:11@192.168.1.2');
assert.equal(ready.profile.authorizationUsername, '11');

assert.equal(resolveSoftphonePbxHost({
  configuredHost: '',
  apiUrl: 'http://127.0.0.1:83/admin/api/api/rest',
  requestHost: '192.168.1.14'
}), '192.168.1.14');
assert.equal(resolveSoftphonePbxHost({
  configuredHost: 'pbx.example.test',
  apiUrl: 'https://api.example.test/admin/api/api/rest',
  requestHost: 'panel.example.test'
}), 'pbx.example.test');
assert.equal(resolveSoftphonePbxHost({
  apiUrl: 'https://pbx.example.test/admin/api/api/rest',
  requestHost: 'panel.example.test'
}), 'pbx.example.test');

const missingSecret = buildSoftphoneAutoConfig({
  username: 'operator', extension: '11', displayName: '', pbxHost: '192.168.1.2', deviceTech: 'pjsip', pjsip: { webrtc: 'yes' }
});
assert.equal(missingSecret.ready, false);
assert.equal(missingSecret.checks.find(check => check.key === 'secret')?.status, 'error');

const unsafeEndpoint = buildSoftphoneAutoConfig({
  username: 'operator', extension: '11', displayName: '', pbxHost: '192.168.1.2', deviceTech: 'sip', pjsip: { secret: 'hidden' }
});
assert.equal(unsafeEndpoint.ready, false);
assert.equal(unsafeEndpoint.checks.find(check => check.key === 'technology')?.status, 'error');
assert.equal(unsafeEndpoint.checks.find(check => check.key === 'dtls')?.status, 'error');

const serverSource = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
assert.match(serverSource, /SELECT keyword,data FROM asterisk\.sip[\s\S]*driver\.data='chan_pjsip'/);
assert.doesNotMatch(serverSource, /SELECT keyword,data FROM asterisk\.pjsip WHERE id=\?/);
assert.doesNotMatch(serverSource, /\[settings\.amiHost, settings\.dbHost\]/);

const previousDedicated = process.env.PBXPULS_SOFTPHONE_ENCRYPTION_KEY;
const previousJwt = process.env.JWT_SECRET;
delete process.env.PBXPULS_SOFTPHONE_ENCRYPTION_KEY;
process.env.JWT_SECRET = 'production-installation-secret-for-test';
const encryption = new SoftphoneCredentialCrypto();
assert.equal(encryption.ready(), true);
const encrypted = encryption.encrypt('sip-private-value');
assert.doesNotMatch(encrypted.ciphertext, /sip-private-value/);
assert.equal(encryption.decrypt(encrypted.ciphertext), 'sip-private-value');
if (previousDedicated === undefined) delete process.env.PBXPULS_SOFTPHONE_ENCRYPTION_KEY;
else process.env.PBXPULS_SOFTPHONE_ENCRYPTION_KEY = previousDedicated;
if (previousJwt === undefined) delete process.env.JWT_SECRET;
else process.env.JWT_SECRET = previousJwt;

console.log('softphone auto-config tests passed');
