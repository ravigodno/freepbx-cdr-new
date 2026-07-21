import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasUserPermission, type PermissionKey } from '../src/modules/access/permissions.js';

const monitoringPermissions: PermissionKey[] = [
  'view_active_calls', 'view_tcpdump', 'view_sngrep', 'view_cli', 'view_db_explorer',
  'view_sip_devices_map', 'view_quality', 'view_health', 'view_ai_pbx_admin',
  'view_security', 'view_log_analysis'
];
const settings = { moduleVisibility: { monitoring: true, ai_pbx_admin: true } } as any;
const role = (enabled: PermissionKey[]) => ({
  role: 'custom' as const,
  permissions: Object.fromEntries(monitoringPermissions.map(permission => [permission, enabled.includes(permission)]))
});

for (const permission of monitoringPermissions) {
  assert.equal(hasUserPermission(role([permission]), settings, permission), true, `${permission} must be independently enabled`);
  for (const other of monitoringPermissions.filter(item => item !== permission)) {
    assert.equal(hasUserPermission(role([permission]), settings, other), false, `${permission} must not grant ${other}`);
  }
}
for (const permission of monitoringPermissions) {
  assert.equal(hasUserPermission(role([]), settings, permission), false, `empty role must deny ${permission}`);
}
const multi = role(['view_active_calls', 'view_quality', 'view_log_analysis']);
assert.deepEqual(monitoringPermissions.filter(permission => hasUserPermission(multi, settings, permission)), ['view_active_calls', 'view_quality', 'view_log_analysis']);
assert.equal(hasUserPermission({ role: 'custom', permissions: { view_cli: true } }, settings, 'view_db_explorer'), false);
assert.equal(hasUserPermission({ role: 'custom', permissions: { view_cli: true } }, settings, 'view_health'), false);
assert.equal(hasUserPermission({ role: 'admin' }, settings, 'view_db_explorer'), true);
assert.equal(hasUserPermission({ role: 'admin' }, settings, 'view_health'), true);
assert.equal(hasUserPermission({ role: 'manager' }, settings, 'view_db_explorer'), false);
assert.equal(hasUserPermission({ role: 'manager' }, settings, 'view_health'), false);

const matrix = fs.readFileSync('src/modules/access/components/PermissionsMatrixTab.tsx', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');
const ai = fs.readFileSync('server/aiPbxAdmin.ts', 'utf8');
const security = fs.readFileSync('server/security/router.ts', 'utf8');
const logs = fs.readFileSync('server/logAnalysis/router.ts', 'utf8');
const migration = fs.readFileSync('server/pbxpulsMigrations.ts', 'utf8');

for (const permission of monitoringPermissions) {
  assert.match(matrix, new RegExp(`key: '${permission}'`), `${permission} missing from permissions matrix`);
  assert.match(app, new RegExp(`hasPermission\\('${permission}'\\)`), `${permission} missing from frontend guard`);
}
assert.match(server, /\/api\/db-explorer\/live-snapshot'[\s\S]{0,100}requirePermission\('view_db_explorer'\)/);
assert.match(server, /\/api\/health-report'[\s\S]{0,100}requirePermission\('view_health'\)/);
assert.match(server, /\/api\/live-sessions'[\s\S]{0,100}requirePermission\('view_active_calls'\)/);
assert.match(server, /\/api\/devices-map'[\s\S]{0,100}requirePermission\('view_sip_devices_map'\)/);
assert.match(server, /\/api\/diagnostics\/tcpdump\/download\/:filename'[\s\S]{0,100}requirePermission\('view_tcpdump'\)/);
assert.match(ai, /requireAuth\(\)[\s\S]{0,200}checkPermission\(req, 'view_ai_pbx_admin'\)/);
assert.match(security, /checkPermission\(req, 'view_security'\)/);
for (const endpoint of ['call-trace/core', 'call-trace/logs', 'call-trace/export', '/export', 'events/:id/context']) {
  assert.ok(logs.includes(endpoint), `missing guarded log-analysis endpoint ${endpoint}`);
}
assert.match(logs, /const view=\[requireAuth\(\),permit\]/);

const migrationStart = migration.indexOf("key: '20260721_023_monitoring_tab_permissions'");
const migrationEnd = migration.indexOf('\n  }\n];', migrationStart) + 5;
const migrationBlock = migration.slice(migrationStart, migrationEnd);
assert.match(migrationBlock, /INSERT IGNORE INTO permissions/);
assert.match(migrationBlock, /INSERT IGNORE INTO role_permissions/);
assert.match(migrationBlock, /r\.role_key IN \('su','admin'\)/);
assert.doesNotMatch(migrationBlock, /\b(?:DELETE|UPDATE|TRUNCATE|DROP)\b/i);
assert.equal((migrationBlock.match(/view_db_explorer/g) || []).length >= 2, true);
assert.equal((migrationBlock.match(/view_health/g) || []).length >= 2, true);

console.log('monitoring tab permission tests: ok');
