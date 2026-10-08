import assert from 'node:assert/strict';
import { requestAudioDevices, audioDeviceError } from '../src/modules/softphone/audio/audioDeviceAccess.js';
import { webListenerConfig } from '../server/webListeners.js';

const events: string[] = [];
const media = {
  getUserMedia: async (constraints: any) => {
    assert.deepEqual(constraints, { audio: true, video: false });
    events.push('permission');
    return { getTracks: () => [{ stop: () => events.push('stop') }] };
  },
  enumerateDevices: async () => { events.push('enumerate'); return [{ kind: 'audioinput', label: 'External audio interface', deviceId: 'external' }]; }
};
const devices = await requestAudioDevices(media as any);
assert.equal(devices[0].label, 'External audio interface');
assert.deepEqual(events, ['permission', 'enumerate', 'stop']);
events.length = 0;
await assert.rejects(requestAudioDevices({ ...media, enumerateDevices: async () => { throw Error('enumerate failed'); } } as any));
assert.deepEqual(events, ['permission', 'stop']);
events.length = 0;
await assert.rejects(requestAudioDevices({ ...media, getUserMedia: async () => { throw { name: 'NotAllowedError' }; } } as any));
assert.deepEqual(events, []);
assert.match(audioDeviceError({ name: 'NotAllowedError' }), /Разрешите микрофон/);
assert.match(audioDeviceError({ name: 'NotReadableError' }), /драйвер/);
assert.equal(webListenerConfig({}).httpPort, 3000);
assert.equal(webListenerConfig({ PBXPULS_HTTPS_MODE: 'native', PORT: '3002' }).httpsPort, 3000);
assert.throws(() => webListenerConfig({ PBXPULS_HTTPS_MODE: 'native' }), /different ports/);
assert.throws(() => webListenerConfig({ PORT: 'bad' }), /Invalid/);
assert.throws(() => webListenerConfig({ PBXPULS_HTTP_DISABLED: 'true', PBXPULS_HTTPS_MODE: 'external' }), /requires native/);
console.log('Audio permissions, stream cleanup and HTTPS configuration: passed');
