import assert from 'node:assert/strict';
import { buildCdrLogicalNumberScope } from '../server/reportCdrScope.js';

const baseWhere = '1=1 AND calldate >= ? AND calldate <= ?';
const baseParams = ['2026-01-01 00:00:00', '2026-12-31 23:59:59'];

const unfiltered = buildCdrLogicalNumberScope(baseWhere, baseParams, '');
assert.equal(unfiltered.applied, false);
assert.equal(unfiltered.whereSql, baseWhere);
assert.deepEqual(unfiltered.params, baseParams);

const filtered = buildCdrLogicalNumberScope(baseWhere, baseParams, '+7 (978) 810-12-10');
assert.equal(filtered.applied, true);
assert.match(filtered.whereSql, /COALESCE\(NULLIF\(linkedid, ''\), uniqueid\) IN/);
assert.match(filtered.whereSql, /SELECT DISTINCT/);
assert.match(filtered.whereSql, /src = \?/);
assert.match(filtered.whereSql, /channel LIKE \?/);
assert.equal(filtered.params.length, baseParams.length * 2 + 9);
assert.equal(filtered.params.at(-1), '%79788101210%');

console.log(JSON.stringify({ ok: true, logicalCallScope: true, preservesAllLegs: true }));
