import assert from 'node:assert/strict';
import { hasUserPermission } from '../src/modules/access/permissions.js';

const settings = { moduleVisibility: { monitoring: true } } as any;

assert.equal(hasUserPermission({ role: 'admin' }, settings, 'view_quality'), true);
assert.equal(hasUserPermission({ role: 'manager' }, settings, 'view_quality'), true);
assert.equal(hasUserPermission({ role: 'operator' }, settings, 'view_quality'), false);
assert.equal(hasUserPermission({ role: 'custom', permissions: { view_quality: true } }, settings, 'view_quality'), true);
assert.equal(hasUserPermission({ role: 'custom', permissions: { view_active_calls: true } }, settings, 'view_quality'), false);
assert.equal(hasUserPermission({ role: 'custom', permissions: { view_quality: false } }, settings, 'view_quality'), false);
assert.equal(hasUserPermission({ role: 'admin' }, { moduleVisibility: { monitoring: false } } as any, 'view_quality'), false);
assert.equal(hasUserPermission({ role: 'su' }, { moduleVisibility: { monitoring: false } } as any, 'view_quality'), true);

console.log('Quality permission fixtures passed');
