import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasUserPermission, type PermissionKey } from '../src/modules/access/permissions.js';

const matrixSource = fs.readFileSync(new URL('../src/modules/access/components/PermissionsMatrixTab.tsx', import.meta.url), 'utf8');
const permissionSource = fs.readFileSync(new URL('../src/modules/access/permissions.ts', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const exportSource = fs.readFileSync(new URL('../server/reportUniqueNumbers.ts', import.meta.url), 'utf8');

const matrixBlock = matrixSource.match(/const GROUPS:[\s\S]*?^];/m)?.[0] || '';
const matrixKeys = Array.from(matrixBlock.matchAll(/\bkey:\s*'([^']+)'/g), match => match[1] as PermissionKey);
const declaredKeys = new Set(Array.from(permissionSource.matchAll(/^\s*\|\s*'([^']+)'/gm), match => match[1]));

assert.ok(matrixKeys.length > 0, 'permission matrix must expose permission keys');
assert.equal(new Set(matrixKeys).size, matrixKeys.length, 'permission matrix keys must be unique');
for (const key of matrixKeys) assert.ok(declaredKeys.has(key), `matrix permission ${key} must be declared`);

const settings = {
  moduleVisibility: {
    marketing: true,
    monitoring: true,
    management: true,
    balance: true,
    scripts: true,
    ai_assistant: true,
    ai_pbx_admin: true
  }
};
for (const role of ['admin', 'manager', 'operator', 'directory_only', 'custom'] as const) {
  for (const key of matrixKeys) {
    assert.equal(hasUserPermission({ role, permissions: { [key]: true } }, settings as any, key), true, `${role}:${key} true override`);
    assert.equal(hasUserPermission({ role, permissions: { [key]: false } }, settings as any, key), false, `${role}:${key} false override`);
  }
}

assert.match(serverSource, /permissions\.own_calls_only === true/, 'own_calls_only must be enforced by the server');
assert.doesNotMatch(
  serverSource,
  /app\.(?:post|put|patch|delete)\('\/api\/ai-[^'\n]*'[^ \n]*[\s\S]{0,100}?requirePermission\('view_ai_pbx_admin'\)/,
  'AI PBX write routes must not use view-only permission'
);
for (const key of ['manage_marketing', 'manage_calltracking', 'manage_yandex_metrika', 'manage_yandex_direct', 'manage_ai_pbx_admin']) {
  assert.ok(serverSource.includes(`requirePermission('${key}')`), `${key} must protect a server action`);
}
assert.ok(exportSource.includes("checkPermission(req, 'export_excel')"), 'export_excel must protect report export');

console.log(`access matrix tests: OK (${matrixKeys.length} permissions across 5 non-SU role types)`);
