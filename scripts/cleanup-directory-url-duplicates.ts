import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { getPBXPulsDbConnectionOptions } from '../server/pbxpulsDbConfig.js';

const apply = process.argv.includes('--apply');
const expectedArg = process.argv.find(value => value.startsWith('--expected='));
const expected = expectedArg ? Number(expectedArg.split('=')[1]) : null;
const connection = await mysql.createConnection(getPBXPulsDbConnectionOptions());

try {
  const [candidateRows] = await connection.execute<any[]>(
    `SELECT d.id
     FROM directory_contacts d
     WHERE d.import_job_id IS NULL
       AND d.phone_normalized <> ''
       AND EXISTS (
         SELECT 1 FROM directory_contacts canonical
         WHERE canonical.phone_normalized = d.phone_normalized
           AND canonical.import_job_id IS NOT NULL
       )
     ORDER BY d.id`
  );
  const ids = candidateRows.map(row => String(row.id));
  const snapshotHash = crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
  const [metadataRows] = await connection.execute<any[]>(
    `SELECT COUNT(*) AS count
     FROM directory_contact_metadata m
     JOIN directory_contacts d ON d.id = m.contact_id
     WHERE d.import_job_id IS NULL
       AND d.phone_normalized <> ''
       AND EXISTS (
         SELECT 1 FROM directory_contacts canonical
         WHERE canonical.phone_normalized = d.phone_normalized
           AND canonical.import_job_id IS NOT NULL
       )`
  );
  const preview = {
    mode: apply ? 'apply' : 'preview',
    duplicateContacts: ids.length,
    cascadingMetadataRows: Number(metadataRows[0]?.count || 0),
    snapshotHash
  };
  if (!apply) {
    console.log(JSON.stringify(preview));
  } else {
    if (!Number.isInteger(expected) || expected !== ids.length) throw new Error('DUPLICATE_PREVIEW_COUNT_CHANGED');
    await connection.beginTransaction();
    const [result] = await connection.execute<any>(
      `DELETE duplicate
       FROM directory_contacts duplicate
       JOIN directory_contacts canonical
         ON canonical.phone_normalized = duplicate.phone_normalized
        AND canonical.import_job_id IS NOT NULL
       WHERE duplicate.import_job_id IS NULL
         AND duplicate.phone_normalized <> ''`
    );
    if (Number(result.affectedRows || 0) !== ids.length) throw new Error('DUPLICATE_DELETE_COUNT_MISMATCH');
    await connection.commit();
    console.log(JSON.stringify({ ...preview, deletedContacts: Number(result.affectedRows || 0) }));
  }
} catch (error) {
  try { await connection.rollback(); } catch {}
  throw error;
} finally {
  await connection.end();
}
