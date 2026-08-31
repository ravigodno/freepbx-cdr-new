import assert from 'node:assert/strict';
import net from 'node:net';
import { runAmiHangupChannels } from '../server/amiHangup.js';

const requests: string[] = [];
const server = net.createServer(socket => {
  socket.write('Asterisk Call Manager/10.0\r\n');
  let buffer = '';
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (!buffer.includes('\r\n\r\n')) return;
    const request = buffer;
    buffer = '';
    requests.push(request);
    if (/Action: Login/.test(request)) socket.write('Response: Success\r\nMessage: Authentication accepted\r\n\r\n');
    else if (/Action: Hangup/.test(request)) socket.write('Response: Success\r\nMessage: Channel Hungup\r\n\r\n');
    else if (/Action: Logoff/.test(request)) socket.end();
  });
});

await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const results = await runAmiHangupChannels({
  amiHost: '127.0.0.1', amiPort: address.port, amiUser: 'test-user', amiPass: 'test-secret'
}, ['PJSIP/trunk-00000001', 'PJSIP/15-00000002']);
server.close();

assert.equal(results.length, 2);
assert.ok(results.every(result => result.success));
assert.equal(requests.filter(request => /Action: Hangup/.test(request)).length, 2);
assert.ok(requests.filter(request => /Action: Login/.test(request)).every(request => /Events: off/.test(request)));
assert.ok(requests.some(request => /Channel: PJSIP\/trunk-00000001/.test(request)));
assert.ok(requests.some(request => /Channel: PJSIP\/15-00000002/.test(request)));

console.log('AMI hangup actions: ok');
