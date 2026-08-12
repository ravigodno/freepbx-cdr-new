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

const status = await inspectCdrEncoding();
assert.equal(status.secretsMasked, true);
assert.equal(JSON.stringify(status).includes('do-not-expose'), false);
assert.ok(['healthy', 'repairable', 'manual_required', 'unsupported'].includes(status.state));
console.log('cdr encoding repair tests:', status.state);
