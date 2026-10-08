import assert from 'node:assert/strict';
import { callMatchesExtensions, employeeVisibility, getDepartmentExtensions, includeOwnExtension } from '../server/departmentCallAccess.js';
import { getDirectoryEmployeeDepartments } from '../server/reportDepartments.js';

const directory = [
  { type: 'internal', number: '101', department: 'Продажи' },
  { type: 'internal', number: '102', department: 'Продажи' },
  { type: 'internal', number: '201', department: 'Поддержка' },
  { type: 'internal', number: '301', department: 'Руководство' },
];
const allowed = includeOwnExtension(getDepartmentExtensions(directory, [' продажи ']), '301');
assert.deepEqual(allowed, ['101', '102', '301']);
assert.deepEqual(includeOwnExtension(allowed, '301'), allowed);
assert.deepEqual(includeOwnExtension([], ''), []);
assert.deepEqual(includeOwnExtension([], '301'), ['301']);
const canSee = employeeVisibility(allowed);
assert.equal(canSee('201'), false);
assert.equal(canSee('301'), true);
assert.equal(canSee('1010'), false);
assert.equal(employeeVisibility([])('101'), false);
assert.equal(employeeVisibility(null)('201'), true);
assert.deepEqual(getDirectoryEmployeeDepartments(directory.filter(row => canSee(row.number))), ['Продажи', 'Руководство']);

// A permitted cross-department call must not grant visibility to its other employee.
const crossDepartmentCall = { src: '101', dst: '201' };
assert.equal(callMatchesExtensions(crossDepartmentCall, allowed), true);
assert.deepEqual([crossDepartmentCall.src, crossDepartmentCall.dst].filter(canSee), ['101']);
assert.equal(callMatchesExtensions({ src: '201', dst: '79991234567' }, allowed), false);
assert.equal(callMatchesExtensions({ src: '301', dst: '79991234567' }, allowed), true);
console.log('Department report access: passed');
