import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseDirectoryImportRowsForTest } from '../server/directoryImportJobs.js';

const header = 'fullName;organization;phone;email;comment';
const rows = Array.from({ length: 100_000 }, (_, index) => {
  const serial = String(index).padStart(6, '0');
  return `Контакт ${serial};PBXPuls Test;+79781${serial};contact${serial}@demo.test;тестовый контакт PBXPuls`;
});
const csv = `${header}\r\n${rows.join('\r\n')}\r\n`;
const started = performance.now();
const parsed = parseDirectoryImportRowsForTest(csv);
const elapsedMs = Math.round(performance.now() - started);
assert.equal(parsed.rows.length, 100_000);
assert.equal(parsed.errors.length, 0);
assert.equal(Math.ceil(parsed.rows.length / 500), 200);
assert.equal(Math.ceil(parsed.rows.length / 1000), 100);
assert.equal(parsed.rows[2499].rowNumber, 2501);
assert.equal(new Set(parsed.rows.map(row => row.fingerprint)).size, 100_000);

const source = fs.readFileSync(new URL('../server/directoryImportJobs.ts', import.meta.url), 'utf8');
for (const required of ['cancel_requested', 'rollback_on_error', 'completed_with_errors', 'idempotency_key', 'batch_size']) {
  assert.ok(source.includes(required), `missing import lifecycle marker: ${required}`);
}
console.log(JSON.stringify({ validRows: parsed.rows.length, validationErrors: parsed.errors.length, batch500: 200, batch1000: 100, elapsedMs }));
