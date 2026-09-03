import assert from 'node:assert/strict';
import { callMatchesExtensions, getDepartmentExtensions, normalizeDepartmentNames } from '../server/departmentCallAccess.js';

assert.deepEqual(normalizeDepartmentNames([' Продажи ', 'продажи', '', 'Поддержка']), ['Поддержка', 'Продажи']);

const extensions = getDepartmentExtensions([
  { type: 'internal', department: 'Продажи', internalExtension: '101' },
  { type: 'internal', department: 'продажи', number: '102' },
  { type: 'internal', department: 'Поддержка', number: '201' },
  { type: 'client', department: 'Продажи', number: '+79781234567' }
], ['Продажи']);
assert.deepEqual(extensions, ['101', '102']);
assert.equal(callMatchesExtensions({ src: '101', dst: '79781234567' }, extensions), true);
assert.equal(callMatchesExtensions({ channel: 'PJSIP/102-000001', dst: '79781234567' }, extensions), true);
assert.equal(callMatchesExtensions({ answeredExts: ['201'], src: '79781234567' }, extensions), false);
assert.equal(callMatchesExtensions({ src: '1101', dst: '79781234567' }, extensions), false);
assert.equal(callMatchesExtensions({ src: '101', dst: '79781234567' }, []), false);

console.log('department call access tests: OK');
