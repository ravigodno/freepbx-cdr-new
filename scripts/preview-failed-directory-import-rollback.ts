import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { parseDirectoryCsv, validateDirectoryPhone } from '../shared/directoryImportValidation.js';
import { getPBXPulsDbConnectionOptions } from '../server/pbxpulsDbConfig.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const sourcePath = process.argv[2] || 'pbxpuls_test_contacts_100000_import_ready.csv';
const parsed = parseDirectoryCsv(fs.readFileSync(sourcePath, 'utf8'));
const headers = parsed.rows[0].values.map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase());
const at = (...names: string[]) => names.map(name => headers.indexOf(name.toLowerCase())).find(index => index >= 0) ?? -1;
const indexes = {
  name: at('fullname', 'name', 'фио'),
  company: at('organization', 'company', 'организация'),
  phone: at('phone', 'phone1', 'телефон'),
  email: at('email', 'почта'),
  comment: at('comment', 'комментарий')
};
const sourceByPhone = new Map(parsed.rows.slice(1).map(row => {
  const phone = validateDirectoryPhone(row.values[indexes.phone] || '').digits;
  return [phone, {
    rowNumber: row.rowNumber,
    name: String(row.values[indexes.name] || '').trim(),
    company: String(row.values[indexes.company] || '').trim(),
    phone,
    email: String(row.values[indexes.email] || '').trim().toLowerCase(),
    comment: String(row.values[indexes.comment] || '').trim()
  }];
}));

const connection = await mysql.createConnection(getPBXPulsDbConnectionOptions());
try {
  const [candidates] = await connection.execute<any[]>(
    `SELECT id,name,company,phone,phone_normalized,email,comment,created_at
       FROM directory_contacts
      WHERE created_at BETWEEN '2026-07-24 13:42:00' AND '2026-07-24 13:48:00'
        AND id REGEXP '^dir_[0-9]{13}_[0-9]{1,5}$'
      ORDER BY created_at,id`
  );
  const exact: any[] = [];
  const questionable: any[] = [];
  for (const contact of candidates) {
    const source = sourceByPhone.get(String(contact.phone_normalized || validateDirectoryPhone(contact.phone).digits));
    const checks = {
      sourcePhone: Boolean(source),
      email: Boolean(source && source.email === String(contact.email || '').trim().toLowerCase()),
      name: Boolean(source && source.name === String(contact.name || '').trim()),
      company: Boolean(source && source.company === String(contact.company || '').trim()),
      comment: Boolean(source && source.comment === String(contact.comment || '').trim()),
      legacyId: /^dir_\d{13}_\d{1,5}$/.test(String(contact.id)),
      creationWindow: true
    };
    const item = { ...contact, sourceRow: source?.rowNumber || null, checks };
    if (Object.values(checks).every(Boolean)) exact.push(item);
    else questionable.push(item);
  }
  const ids = exact.map(item => item.id);
  let metadataCount = 0;
  let orphanCount = 0;
  if (ids.length) {
    const [metadata] = await connection.query<any[]>(
      `SELECT COUNT(*) count FROM directory_contact_metadata WHERE contact_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    metadataCount = Number(metadata[0]?.count || 0);
    const [orphans] = await connection.query<any[]>(
      `SELECT COUNT(*) count FROM directory_contact_metadata m LEFT JOIN directory_contacts c ON c.id=m.contact_id WHERE c.id IS NULL`
    );
    orphanCount = Number(orphans[0]?.count || 0);
  }
  const signature = crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
  const report = {
    previewId: `legacy_dirrb_${signature.slice(0, 24)}`,
    sourceFilename: sourcePath.split('/').pop(),
    sourceRows: parsed.rows.length - 1,
    contactsToDelete: exact.length,
    relatedRows: { directory_contact_metadata: metadataCount },
    questionableMatches: questionable.length,
    orphanMetadataRows: orphanCount,
    minCreatedAt: exact[0]?.created_at || null,
    maxCreatedAt: exact.at(-1)?.created_at || null,
    sourceRowRange: exact.length ? [Math.min(...exact.map(item => item.sourceRow)), Math.max(...exact.map(item => item.sourceRow))] : null,
    identificationCriteria: ['phone in source CSV', 'email exact', 'full name exact', 'organization exact', 'comment exact', 'creation window', 'legacy run ID pattern'],
    rollbackSafe: exact.length > 0 && questionable.length === 0 && orphanCount === 0,
    transactionPlan: ['BEGIN', 'revalidate every candidate signature', 'DELETE related rows through FK/cascade', 'DELETE exact contacts', 'write one audit summary', 'COMMIT; ROLLBACK on any error'],
    applyExecuted: false,
    sample: exact.slice(0, 20).map(({ checks: _checks, ...item }) => item)
  };
  const output = `/tmp/${report.previewId}.json`;
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...report, sample: undefined, reportPath: output }));
} finally {
  await connection.end();
}
