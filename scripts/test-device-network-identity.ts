import assert from 'node:assert/strict';
import { mergeDeviceNetworkIdentity, normalizeMacAddress, parseIpNeighborMacs } from '../server/deviceNetworkIdentity.js';

const neighbors = parseIpNeighborMacs(`
192.168.1.120 dev eth0 lladdr 00:15:65:F9:E5:0C STALE
? (192.168.1.222) at 00:0b:82:b0:0a:48 [ether] on eth0
192.168.1.7 dev eth0 FAILED
`);
assert.equal(neighbors.get('192.168.1.120'), '00:15:65:f9:e5:0c');
assert.equal(neighbors.get('192.168.1.222'), '00:0b:82:b0:0a:48');
assert.equal(neighbors.has('192.168.1.7'), false);
assert.equal(normalizeMacAddress('00-15-65-F9-E5-0C'), '00:15:65:f9:e5:0c');
assert.equal(normalizeMacAddress('00:00:00:00:00:00'), '');

const merged = mergeDeviceNetworkIdentity([
  { ext: '299', ip: '192.168.1.121', ipChanges: 0, network: { mac: '00:15:65:f9:e5:0c' } }
], [
  { ext: '299', ip: '192.168.1.120', ipChanges: 2, network: { mac: '00:15:65:f9:e5:0c', ipHistory: ['192.168.1.119', '192.168.1.120'] } }
]);
assert.equal(merged[0].ipChanges, 3);
assert.deepEqual(merged[0].network.ipHistory, ['192.168.1.119', '192.168.1.120', '192.168.1.121']);
assert.deepEqual(merged[0].network.macHistory, ['00:15:65:f9:e5:0c']);

console.log('device network identity tests: ok');
