import path from 'node:path';
import dotenv from 'dotenv';
import { queryPBXPulsDb } from '../server/pbxpulsDb.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

async function main() {
  const [versionRows, tableRows, metadataRows] = await Promise.all([
    queryPBXPulsDb('SELECT VERSION() version'),
    queryPBXPulsDb(
      `SELECT TABLE_NAME tableName,TABLE_ROWS estimatedRows,DATA_LENGTH dataBytes,INDEX_LENGTH indexBytes,ENGINE engine
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('directory_contacts','directory_contact_metadata')`
    ),
    queryPBXPulsDb(
      `SELECT COUNT(*) metadataRows,
              COALESCE(SUM(CHAR_LENGTH(COALESCE(metadata_value,value,metadata_json,''))),0) metadataCharacters
       FROM directory_contact_metadata`
    )
  ]);
  const contacts = Number(tableRows.find(row => row.tableName === 'directory_contacts')?.estimatedRows || 0);
  const metadataCharacters = Number(metadataRows[0]?.metadataCharacters || 0);
  const estimatedDataBytes = Math.ceil((contacts * 900) + metadataCharacters);
  const ddl = `CREATE TABLE directory_contact_search (
  contact_id VARCHAR(64) NOT NULL,
  name_normalized VARCHAR(255) NOT NULL DEFAULT '',
  company_normalized VARCHAR(255) NOT NULL DEFAULT '',
  email_normalized VARCHAR(255) NOT NULL DEFAULT '',
  website_normalized VARCHAR(255) NOT NULL DEFAULT '',
  phone_tokens VARCHAR(512) NOT NULL DEFAULT '',
  search_text MEDIUMTEXT NOT NULL,
  projection_version INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (contact_id),
  KEY idx_directory_search_name (name_normalized(191)),
  KEY idx_directory_search_company (company_normalized(191)),
  KEY idx_directory_search_email (email_normalized(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

  console.log(JSON.stringify({
    previewOnly: true,
    applied: false,
    databaseVersion: versionRows[0]?.version || null,
    sourceTables: tableRows,
    sourceMetadataRows: Number(metadataRows[0]?.metadataRows || 0),
    estimatedProjectionDataBytes: estimatedDataBytes,
    ddl,
    backfillPlan: [
      'Build rows in deterministic contact_id batches of 500-1000.',
      'Normalize in application code; do not run REPLACE/REGEXP over phone_normalized.',
      'Verify row count and a deterministic source digest before enabling reads.',
      'Dual-write projection only after create/update/import/rollback invalidation tests pass.'
    ],
    fulltextDecision: 'Do not add FULLTEXT in the initial DDL. MariaDB 5.5 InnoDB FULLTEXT support and Russian tokenization must be verified separately.',
    expectedLock: 'CREATE TABLE has no lock on directory_contacts; backfill is read-only on source tables but adds IO load. Schedule outside peak hours.',
    rollbackPlan: 'Disable projection reads first, then DROP TABLE directory_contact_search. Source contacts and metadata remain unchanged.'
  }, null, 2));
  process.exit(0);
}

main().catch(error => {
  console.error(JSON.stringify({ previewOnly: true, applied: false, error: String(error?.message || error).slice(0, 300) }));
  process.exitCode = 1;
});
