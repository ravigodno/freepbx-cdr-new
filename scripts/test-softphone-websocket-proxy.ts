import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { attachSoftphoneWebsocketProxy, transportTicket, validTransportTicket, proxiedWebsocketUrl } from '../server/softphone/websocketProxy.js';

const env = { PBXPULS_HTTPS_MODE: 'native', PBXPULS_HTTPS_PORT: '3000' };
assert.equal(proxiedWebsocketUrl('wss://192.168.1.2:8089/ws', '192.168.1.2', env), 'wss://192.168.1.2:3000/softphone/ws');
assert.equal(proxiedWebsocketUrl('wss://other:8089/ws', '192.168.1.2', env), 'wss://other:8089/ws');
assert.equal(proxiedWebsocketUrl('wss://192.168.1.2:9999/custom', '192.168.1.2', env), 'wss://192.168.1.2:9999/custom');
assert.equal(validTransportTicket(transportTicket()), true);
assert.equal(validTransportTicket(transportTicket(Date.now() - 360000)), false);
assert.equal(validTransportTicket('123.invalid'), false);
const upstream = new WebSocketServer({ host: '127.0.0.1', port: 0 });
await once(upstream, 'listening');
let connections = 0;
upstream.on('connection', ws => { connections++; ws.on('message', (data, binary) => ws.send(data, { binary })); });
const server = http.createServer();
attachSoftphoneWebsocketProxy(server, `ws://127.0.0.1:${(upstream.address() as any).port}/ws`);
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `ws://127.0.0.1:${(server.address() as any).port}/softphone/ws`;
const headers = { Origin: 'https://127.0.0.1:3000', Cookie: `pbxpuls_softphone_transport=${transportTicket()}` };
let client: WebSocket | undefined;
try {
  const denied = async (extra: Record<string, string>) => {
    const ws = new WebSocket(url, 'sip', { headers: extra });
    const status = await new Promise<number>((resolve, reject) => { ws.on('error', () => undefined); ws.on('unexpected-response', (_req, res) => { resolve(res.statusCode!); ws.terminate(); }); ws.on('open', () => { ws.terminate(); reject(Error('Unexpected acceptance')); }); });
    assert.equal(status, 403);
  };
  await denied({ Origin: headers.Origin });
  await denied({ ...headers, Origin: 'https://evil.example' });
  assert.equal(connections, 0);
  client = new WebSocket(url, 'sip', { headers }); await once(client, 'open');
  assert.equal(client.protocol, 'sip');
  const response = once(client, 'message');
  client.send('SIP relay fixture');
  const [data, binary] = await response;
  assert.equal(data.toString(), 'SIP relay fixture'); assert.equal(binary, false);
  const closed = once(client, 'close'); client.close(); await closed;
  console.log('WSS routing, access ticket, origin check and text relay: passed');
} finally {
  client?.terminate();
  for (const ws of upstream.clients) ws.terminate();
  await new Promise<void>(resolve => upstream.close(() => resolve()));
  await new Promise<void>(resolve => server.close(() => resolve()));
}
