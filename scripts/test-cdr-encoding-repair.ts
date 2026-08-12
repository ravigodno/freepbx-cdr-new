import assert from 'node:assert/strict';
import { cdrEncodingRepairInternals, inspectCdrEncoding } from '../server/cdrEncodingRepair.js';

const source = `[MySQL-asteriskcdrdb]
driver=MySQL
server=localhost
Password=do-not-expose

[other]
Driver=Other
`;

const parsed = cdrEncodingRepairInternals.parseIniSection(source, 'mysql-ASTERISKCDRDB');
assert.equal(parsed?.driver, 'MySQL');
assert.equal(parsed?.password, 'do-not-expose');

let repaired = cdrEncodingRepairInternals.replaceIniValue(source, 'MySQL-asteriskcdrdb', 'driver', 'MariaDB');
repaired = cdrEncodingRepairInternals.replaceIniValue(repaired, 'MySQL-asteriskcdrdb', 'Charset', 'utf8');
const repairedSection = cdrEncodingRepairInternals.parseIniSection(repaired, 'MySQL-asteriskcdrdb');
assert.equal(repairedSection?.driver, 'MariaDB');
assert.equal(repairedSection?.charset, 'utf8');
assert.equal(repairedSection?.password, 'do-not-expose');
assert.equal(cdrEncodingRepairInternals.parseIniSection(repaired, 'other')?.driver, 'Other');
assert.deepEqual(cdrEncodingRepairInternals.resolvePackageManager({ ID: 'debian', ID_LIKE: '' }, { yum: false, aptGet: true, dpkgQuery: true }), { manager: 'apt-get', packageName: 'odbc-mariadb', supported: true });
assert.deepEqual(cdrEncodingRepairInternals.resolvePackageManager({ ID: 'ubuntu', ID_LIKE: 'debian' }, { yum: false, aptGet: true, dpkgQuery: true }), { manager: 'apt-get', packageName: 'odbc-mariadb', supported: true });
assert.deepEqual(cdrEncodingRepairInternals.resolvePackageManager({ ID: 'sangoma', ID_LIKE: 'centos rhel' }, { yum: true, aptGet: false, dpkgQuery: false }), { manager: 'yum', packageName: 'mariadb-connector-odbc', supported: true });
assert.deepEqual(cdrEncodingRepairInternals.resolvePackageManager({ ID: 'unsupported', ID_LIKE: '' }, { yum: true, aptGet: true, dpkgQuery: true }), { manager: null, packageName: '', supported: false });

const status = await inspectCdrEncoding();
assert.equal(status.secretsMasked, true);
assert.equal(JSON.stringify(status).includes('do-not-expose'), false);
assert.ok(['healthy', 'repairable', 'manual_required', 'unsupported'].includes(status.state));
if (status.driver.registered && status.driver.libraryExists && status.dsn.exists && status.dsn.driver.toLowerCase() === 'mariadb' && /^utf-?8(?:mb4)?$/i.test(status.dsn.charset)) {
  assert.equal(status.state, 'healthy');
  assert.equal(status.checks.every(check => check.ok), true);
}
console.log('cdr encoding repair tests:', status.state);
