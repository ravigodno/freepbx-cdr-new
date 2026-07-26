import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseDirectoryImportRows } from '../server/directoryImportJobs.js';

const sourcePath = process.env.PREVIEW_CSV || '';
if (!sourcePath) throw new Error('PREVIEW_CSV is required');

const parsed = parseDirectoryImportRows(fs.readFileSync(sourcePath, 'utf8'));
const raw = execFileSync('mysql', [
  '-NBe',
  "USE pbxpuls; SELECT phone_normalized,LOWER(email),COALESCE(import_row_fingerprint,'') FROM directory_contacts ORDER BY import_row_fingerprint IS NULL,id"
], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const byPhone = new Map<string, string>();
const byEmail = new Map<string, string>();
for (const line of raw.trim().split('\n')) {
  const [phone, email = '', fingerprint = ''] = line.split('\t');
  if (phone && !byPhone.has(phone)) byPhone.set(phone, fingerprint);
  if (email && !byEmail.has(email)) byEmail.set(email, fingerprint);
}

let unchanged = 0;
let changed = 0;
let added = 0;
for (const row of parsed.rows) {
  const existing = byPhone.get(row.phoneNormalized) ?? (row.email ? byEmail.get(row.email.toLowerCase()) : undefined);
  if (existing === undefined) added++;
  else if (existing === row.fingerprint) unchanged++;
  else changed++;
}

console.log(JSON.stringify({
  rows: parsed.rows.length,
  errors: parsed.errors.length,
  unchanged,
  changed,
  added
}));
