import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import type { Express } from 'express';
import { attachSoftphoneWebsocketProxy } from './softphone/websocketProxy.js';

export function webListenerConfig(env: NodeJS.ProcessEnv) {
  const port = (value: string | undefined, fallback: number) => {
    const n = Number(value || fallback);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Invalid PBXPuls web port');
    return n;
  };
  const mode = env.PBXPULS_HTTPS_MODE || 'off';
  if (!['native', 'external', 'off'].includes(mode)) throw new Error('Invalid PBXPULS_HTTPS_MODE');
  const httpEnabled = env.PBXPULS_HTTP_DISABLED !== 'true';
  const httpPort = port(env.PORT, 3000);
  const httpsPort = port(env.PBXPULS_HTTPS_PORT, 3000);
  if (mode === 'native' && httpEnabled && httpPort === httpsPort) throw new Error('HTTP and HTTPS need different ports');
  if (!httpEnabled && mode !== 'native') throw new Error('Disabling HTTP requires native HTTPS');
  return { mode, httpEnabled, httpPort, httpsPort };
}

export async function startWebListeners(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const config = webListenerConfig(env);
  const servers: http.Server[] = [];
  const listen = async (server: http.Server, port: number, host: string) => {
    if (server instanceof https.Server && config.mode === 'native' && env.PBXPULS_SOFTPHONE_LOCAL_PROXY !== 'false') attachSoftphoneWebsocketProxy(server);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
    });
  };
  try {
    if (config.mode === 'native') {
      if (!env.PBXPULS_TLS_KEY || !env.PBXPULS_TLS_CERT) throw new Error('HTTPS certificate paths are not configured; run scripts/configure-https.mjs');
      await listen(https.createServer({ key: fs.readFileSync(env.PBXPULS_TLS_KEY), cert: fs.readFileSync(env.PBXPULS_TLS_CERT), minVersion: 'TLSv1.2' }, app), config.httpsPort, env.PBXPULS_HTTPS_HOST || '0.0.0.0');
      console.log(`PBXPuls HTTPS listening on ${config.httpsPort}`);
    }
    if (config.httpEnabled) {
      await listen(http.createServer(app), config.httpPort, env.PBXPULS_HTTP_HOST || (config.mode === 'native' ? '127.0.0.1' : '0.0.0.0'));
      console.log(`PBXPuls HTTP listening on ${config.httpPort}`);
    }
    return servers;
  } catch (error) {
    await Promise.all(servers.filter(server => server.listening).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    throw error;
  }
}
