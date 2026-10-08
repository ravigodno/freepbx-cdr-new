import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { registerHeadsetSetupRoutes, headsetPlanErrors } from '../server/softphone/headsetSetup.js';

const inspection = { ok: true, ready: true, extension: '11', device: '9911', exists: false, checks: [], digest: 'digest', module: null };
assert.deepEqual(headsetPlanErrors(inspection, 'lan', true, true), []);
assert.ok(headsetPlanErrors(inspection, 'internet', true, true).length);
assert.ok(headsetPlanErrors({ ...inspection, checks: ['companion_number_conflict'] }, 'lan', true, true).length);
const app = express(); app.use(express.json());
let role = 'operator'; let extension = '11'; let row: any; let failVerify = false; let calls: string[] = []; let sql: string[] = [];
const query = async (statement: string, params: any[] = []) => {
  sql.push(statement);
  if (statement.startsWith('INSERT INTO softphone_setup_previews')) row = { id: params[0], username: params[1], extension: params[2], plan_json: params[3], status: 'pending' };
  return [];
};
const connection = { execute: async (statement: string, params: any[]) => {
  sql.push(statement);
  if (statement.startsWith('SELECT * FROM softphone_setup_previews')) return [[row && row.id === params[0] && row.username === params[1] && row.status === 'pending' ? row : undefined].filter(Boolean)];
  if (statement.startsWith('SELECT id')) return [[]];
  if (statement.includes("SET status='applying'")) row.status = 'applying';
  if (statement.includes("SET status='applied'")) row.status = 'applied';
  return [{ affectedRows: 1 }];
} };
registerHeadsetSetupRoutes(app, {
  requireAuth: () => (req, _res, next) => { (req as any).user = { username: 'admin', role }; next(); },
  checkPermission: async () => true,
  resolveAutoConfigSource: async () => ({ username: 'admin', extension, displayName: 'Test', pbxHost: '127.0.0.1', deviceTech: 'pjsip', pjsip: {} })
}, {
  provider: { command: async (action: string) => { calls.push(action); return action === 'apply' ? { ...inspection, created: true, secret: 'secret-must-not-leak' } : inspection; }, reloadAndVerify: async () => { calls.push('verify'); if (failVerify) throw Error('failure'); }, reload: async () => { calls.push('reload'); } } as any,
  encryption: { ready: () => true, encrypt: () => ({ ciphertext: 'encrypted-value', keyVersion: 'v1' }) } as any,
  query, transaction: async (work: any) => work(connection)
});
const beforeMode = process.env.PBXPULS_HTTPS_MODE; process.env.PBXPULS_HTTPS_MODE = 'native';
const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
const post = async (action: string, body = {}) => {
  const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/softphone/setup/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
try {
  assert.equal((await post('preview')).status, 403); assert.equal(calls.length, 0);
  role = 'admin';
  const preview = await post('preview', { network: 'lan' });
  assert.equal(preview.body.ready, true); assert.doesNotMatch(JSON.stringify(preview.body), /digest|secret-must/);
  assert.equal((await post('apply', { previewId: preview.body.previewId })).status, 400);
  extension = '12'; assert.equal((await post('apply', { previewId: preview.body.previewId, confirm: true })).status, 409); assert.deepEqual(calls, ['inspect']);
  extension = '11'; calls = []; sql = [];
  assert.equal((await post('apply', { previewId: preview.body.previewId, confirm: true })).status, 200);
  assert.deepEqual(calls, ['apply', 'verify']); assert.equal(row.status, 'applied');
  assert.equal((await post('apply', { previewId: preview.body.previewId, confirm: true })).status, 409); assert.deepEqual(calls, ['apply', 'verify']);
  const retry = await post('preview', { network: 'lan' }); calls = []; sql = []; failVerify = true;
  const failure = await post('apply', { previewId: retry.body.previewId, confirm: true });
  assert.equal(failure.status, 409); assert.deepEqual(calls, ['apply', 'verify', 'rollback', 'reload']);
  assert.ok(!sql.some(s => s.startsWith('INSERT INTO softphone_profiles')));
  assert.doesNotMatch(JSON.stringify(failure.body), /secret-must/);
  console.log('Headset setup: permissions, preview binding, duplicate apply, secret redaction and rollback passed');
} finally {
  if (beforeMode === undefined) delete process.env.PBXPULS_HTTPS_MODE; else process.env.PBXPULS_HTTPS_MODE = beforeMode;
  await new Promise<void>(resolve => server.close(() => resolve()));
}
