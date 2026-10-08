import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import express from 'express';
import dotenv from 'dotenv';
import { startWebListeners } from '../server/webListeners.js';

if (process.platform !== 'linux' || process.getuid?.() !== 0) throw Error('Run in an isolated Linux root test workspace');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbxpuls-https-test-'));
const script = path.resolve('scripts/configure-https.mjs');
const env = { ...process.env, PBXPULS_HTTPS_PORT: '39443', PBXPULS_INTERNAL_HTTP_PORT: '39444', PBXPULS_TLS_DIR: path.join(dir, 'tls'), PBXPULS_APACHE_CONFIG: 'none', PBXPULS_HTTPS_BACKUP_DIR: path.join(dir, 'backup') };
let servers: http.Server[] = [];
try {
  fs.writeFileSync(path.join(dir, '.env'), 'PORT="3000"\nTEST_PRESERVE="unchanged"\n');
  fs.mkdirSync(path.join(dir, 'public')); fs.mkdirSync(path.join(dir, 'dist'));
  const run = (args: string[], overrides = {}) => execFileSync(process.execPath, [script, ...args], { cwd: dir, env: { ...env, ...overrides }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  run([]);
  assert.equal(fs.existsSync(path.join(dir, 'tls')), false, 'preview must not create files');
  run(['--apply']);
  const configured = dotenv.parse(fs.readFileSync(path.join(dir, '.env')));
  assert.equal(configured.TEST_PRESERVE, 'unchanged');
  assert.equal(configured.PORT, '39444');
  assert.equal(configured.PBXPULS_HTTP_HOST, '127.0.0.1');
  const keyBefore = fs.readFileSync(configured.PBXPULS_TLS_KEY);
  const certBefore = fs.readFileSync(configured.PBXPULS_TLS_CERT);
  assert.equal(fs.statSync(configured.PBXPULS_TLS_KEY).mode & 0o777, 0o600);
  run(['--apply'], { PBXPULS_HTTPS_BACKUP_DIR: path.join(dir, 'backup-repeat') });
  assert.deepEqual(fs.readFileSync(configured.PBXPULS_TLS_KEY), keyBefore);
  assert.deepEqual(fs.readFileSync(configured.PBXPULS_TLS_CERT), certBefore);
  const app = express(); app.get('/', (_req, res) => res.send('https-ready'));
  servers = await startWebListeners(app, { ...configured, PBXPULS_HTTPS_HOST: '127.0.0.1' });
  const body = await new Promise<string>((resolve, reject) => {
    https.get({ host: '127.0.0.1', port: 39443, servername: 'localhost', ca: fs.readFileSync(path.join(dir, 'tls/pbxpuls-ca.crt')) }, res => {
      let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  assert.equal(body, 'https-ready');
  assert.throws(() => run(['--apply']), /Command failed/, 'occupied ports must stop apply');
  assert.deepEqual(dotenv.parse(fs.readFileSync(path.join(dir, '.env'))), configured);
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve())))); servers = [];
  execFileSync('bash', [path.join(dir, 'backup/rollback.sh')]);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), 'PORT="3000"\nTEST_PRESERVE="unchanged"\n');
  console.log('HTTPS setup, trusted TLS request, idempotency, conflict and rollback: passed');
} finally {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  fs.rmSync(dir, { recursive: true, force: true });
}
