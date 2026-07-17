import assert from 'node:assert/strict';
import { buildOutgoingAttemptsSql, parseOutgoingFilters } from '../server/outgoingReports.js';

const filters=parseOutgoingFilters({startDate:'2026-07-01',endDate:'2026-07-17',group:'day',extensions:'100,200',page:'2'});
assert.deepEqual(filters.extensions,['100','200']);
assert.equal(filters.page,2);
assert.throws(()=>parseOutgoingFilters({startDate:'2025-01-01',endDate:'2026-07-17'}),/366/);
const built=buildOutgoingAttemptsSql(filters,['100','200']);
assert.match(built.sql,/COALESCE\(NULLIF\(linkedid,''\), uniqueid\)/);
assert.match(built.sql,/HAVING internal_extension IS NOT NULL AND external_number IS NOT NULL/);
assert.match(built.sql,/disposition='ANSWERED' AND billsec>0/);
assert.match(built.sql,/GREATEST\(duration-billsec,0\)/);
assert.ok(built.params.includes('100'));
console.log('Outgoing report regression tests passed');
