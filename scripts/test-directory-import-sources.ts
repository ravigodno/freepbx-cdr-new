import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import {
  cleanupExpiredDirectoryImportSources,
  directoryImportSourceFilePath,
  prepareDirectoryImportSource,
  verifyDirectoryImportSource
} from '../server/directoryImportSources.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pbxpuls-directory-sources-'));
try {
  const csv = Buffer.from('type,visibility,fullName,phone\nclient,shared,Иван,100\n');
  const prepared = await prepareDirectoryImportSource({
    root,
    actor: 'test-user',
    originalFilename: 'contacts.csv',
    expectedBytes: csv.length,
    diagnostics: { secureContext: false, browserSubtle: false, errorCode: 'INSECURE_CONTEXT' },
    source: Readable.from(csv)
  });
  assert.equal(prepared.record.status, 'ready');
  assert.equal(prepared.record.row_count, 1);
  assert.equal(prepared.record.sha256, crypto.createHash('sha256').update(csv).digest('hex'));
  assert.equal(prepared.record.client_diagnostics.errorCode, 'INSECURE_CONTEXT');
  assert.ok(!directoryImportSourceFilePath(prepared.record, root).includes('/public/'));
  assert.equal(fs.statSync(directoryImportSourceFilePath(prepared.record, root)).mode & 0o777, 0o600);
  await verifyDirectoryImportSource(prepared.record, root);
  const systemDigest = execFileSync('sha256sum', [directoryImportSourceFilePath(prepared.record, root)], { encoding: 'utf8' }).split(/\s+/)[0];
  assert.equal(systemDigest, prepared.record.sha256);

  const duplicate = await prepareDirectoryImportSource({
    root,
    actor: 'test-user',
    originalFilename: 'contacts.csv',
    expectedBytes: csv.length,
    source: Readable.from(csv)
  });
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.record.id, prepared.record.id);

  await assert.rejects(() => prepareDirectoryImportSource({
    root,
    actor: 'test-user',
    originalFilename: '../contacts.csv',
    source: Readable.from(csv)
  }), /INVALID_FILENAME/);

  const largeChunk = Buffer.alloc(1024 * 1024, 0x61);
  const large = await prepareDirectoryImportSource({
    root,
    actor: 'large-test-user',
    originalFilename: 'contacts-35mb.csv',
    expectedBytes: 35 * largeChunk.length,
    source: Readable.from((function* () {
      for (let index = 0; index < 35; index++) yield largeChunk;
    })())
  });
  assert.equal(large.record.size_bytes, 35 * 1024 * 1024);
  await verifyDirectoryImportSource(large.record, root);

  const failedNow = new Date('2026-07-26T00:00:00.000Z');
  await assert.rejects(() => prepareDirectoryImportSource({
    root,
    actor: 'interrupted-user',
    originalFilename: 'interrupted.csv',
    expectedBytes: csv.length + 10,
    now: failedNow,
    source: Readable.from(csv)
  }), /SOURCE_SIZE_MISMATCH/);
  const cleaned = await cleanupExpiredDirectoryImportSources(root, new Date(failedNow.getTime() + 7 * 60 * 60 * 1000));
  assert.ok(cleaned >= 1);

  const realCsv = '/opt/pbxpuls-import-audit/pbxpuls_test_contacts_100000_import_ready.csv';
  if (fs.existsSync(realCsv)) {
    const stat = fs.statSync(realCsv);
    const real = await prepareDirectoryImportSource({
      root,
      actor: 'real-file-check',
      originalFilename: path.basename(realCsv),
      expectedBytes: stat.size,
      source: fs.createReadStream(realCsv)
    });
    assert.equal(real.record.row_count, 100000);
    assert.equal(real.record.status, 'ready');
    const expected = execFileSync('sha256sum', [realCsv], { encoding: 'utf8' }).split(/\s+/)[0];
    assert.equal(real.record.sha256, expected);
    console.log(`real CSV preparation: rows=${real.record.row_count} sha256=${real.record.sha256}`);
  }

  const jobs = fs.readFileSync(new URL('../server/directoryImportJobs.ts', import.meta.url), 'utf8');
  assert.match(jobs, /getReadyDirectoryImportSource\(req\.body\.sourceId/);
  assert.match(jobs, /await verifyDirectoryImportSource\(preparedSource\)/);
  assert.match(jobs, /sourceHash = preparedSource\?\.sha256/);
  console.log('directory import source session tests: OK');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
