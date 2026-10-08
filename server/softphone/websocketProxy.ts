import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import type { Request, Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';

const secret = randomBytes(32);
const cookieName = 'pbxpuls_softphone_transport';
const lifetime = 5 * 60 * 1000;
export const softphoneWebsocketPath = '/softphone/ws';

export function transportTicket(now = Date.now()) {
  const expiry = String(now + lifetime);
  return `${expiry}.${createHmac('sha256', secret).update(expiry).digest('hex')}`;
}
export function validTransportTicket(ticket: string, now = Date.now()) {
  const [expiry, signature] = ticket.split('.');
  if (!/^\d{13}$/.test(expiry || '') || !/^[a-f0-9]{64}$/.test(signature || '')) return false;
  if (Number(expiry) <= now || Number(expiry) > now + lifetime) return false;
  const expected = createHmac('sha256', secret).update(expiry).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function proxiedWebsocketUrl(saved: string, hostname: string, env = process.env) {
  if (env.PBXPULS_HTTPS_MODE !== 'native' || env.PBXPULS_SOFTPHONE_LOCAL_PROXY === 'false') return saved;
  let url: URL;
  try { url = new URL(saved); } catch { return saved; }
  const host = hostname.toLowerCase();
  // Only migrate this installation's legacy default. Remote/custom PBX URLs remain unchanged.
  const legacy = url.port === '8089' && url.pathname === '/ws';
  const proxy = url.port === (env.PBXPULS_HTTPS_PORT || '3000') && url.pathname === softphoneWebsocketPath;
  if (url.protocol !== 'wss:' || url.hostname.toLowerCase() !== host || (!legacy && !proxy) || url.search || url.hash) return saved;
  url.port = env.PBXPULS_HTTPS_PORT || '3000';
  url.pathname = softphoneWebsocketPath;
  return url.toString();
}

export function runtimeWebsocketUrl(saved: string, req: Request, res: Response, env = process.env) {
  const url = proxiedWebsocketUrl(saved, req.hostname, env);
  if (env.PBXPULS_HTTPS_MODE === 'native' && env.PBXPULS_SOFTPHONE_LOCAL_PROXY !== 'false'
    && new URL(url).pathname === softphoneWebsocketPath && new URL(url).hostname === req.hostname) {
    res.cookie(cookieName, transportTicket(), { httpOnly: true, secure: true, sameSite: 'strict', path: softphoneWebsocketPath, maxAge: lifetime });
  }
  return url;
}

export function attachSoftphoneWebsocketProxy(server: Server, upstreamUrl = 'ws://127.0.0.1:8088/ws') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, handleProtocols: protocols => protocols.has('sip') ? 'sip' : false });
  server.on('upgrade', (req, socket, head) => {
    const reject = (status: string) => socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if (req.url !== softphoneWebsocketPath) { reject('404 Not Found'); return; }
    let sameHost = false;
    try {
      const origin = new URL(req.headers.origin || '');
      sameHost = origin.protocol === 'https:' && origin.hostname === new URL(`https://${req.headers.host}`).hostname;
    } catch {}
    const ticket = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || '';
    if (!sameHost || !validTransportTicket(ticket)) { reject('403 Forbidden'); return; }
    if (!String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).includes('sip')) { reject('400 Bad Request'); return; }
    // Fixed loopback target: browser input never selects an upstream or supplies headers to Asterisk.
    const upstream = new WebSocket(upstreamUrl, 'sip', { handshakeTimeout: 5000, maxPayload: 1024 * 1024 });
    let client: WebSocket | undefined;
    socket.on('error', () => upstream.terminate());
    socket.on('close', () => upstream.terminate());
    upstream.on('error', () => { if (client) client.close(1011, 'PBX transport unavailable'); else reject('502 Bad Gateway'); });
    upstream.on('open', () => {
      if (socket.destroyed) { upstream.terminate(); return; }
      wss.handleUpgrade(req, socket, head, ws => {
        client = ws;
        const forward = (target: WebSocket, data: Buffer, binary: boolean) => {
          if (target.readyState !== WebSocket.OPEN) return;
          if (target.bufferedAmount > 1024 * 1024) { ws.close(1013); upstream.close(1013); return; }
          target.send(data, { binary }, error => { if (error) target.terminate(); });
        };
        ws.on('message', (data, binary) => forward(upstream, data as Buffer, binary));
        upstream.on('message', (data, binary) => forward(ws, data as Buffer, binary));
        ws.on('error', () => upstream.terminate());
        ws.on('close', () => upstream.terminate());
        upstream.on('close', () => ws.close(1011, 'PBX transport closed'));
      });
    });
  });
  server.on('close', () => { for (const client of wss.clients) client.terminate(); wss.close(); });
}
