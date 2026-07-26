import path from 'node:path';
import dotenv from 'dotenv';
import { queryPBXPulsDb } from '../server/pbxpulsDb.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const recommendations = [
  {
    name: 'idx_directory_contacts_visibility_type_id',
    columns: 'visibility,type,id',
    sql: 'ALTER TABLE directory_contacts ADD INDEX idx_directory_contacts_visibility_type_id (visibility,type,id)',
  },
  {
    name: 'idx_directory_contacts_spam_visibility_id',
    columns: 'is_spam,visibility,id',
    sql: 'ALTER TABLE directory_contacts ADD INDEX idx_directory_contacts_spam_visibility_id (is_spam,visibility,id)',
  },
  {
    name: 'idx_directory_contacts_owner_visibility_id',
    columns: 'owner_user_id,visibility,id',
    sql: 'ALTER TABLE directory_contacts ADD INDEX idx_directory_contacts_owner_visibility_id (owner_user_id,visibility,id)',
  },
  {
    name: 'idx_directory_contacts_created_id',
    columns: 'created_at,id',
    sql: 'ALTER TABLE directory_contacts ADD INDEX idx_directory_contacts_created_id (created_at,id)',
  },
];

async function main() {
  const version = await queryPBXPulsDb('SELECT VERSION() version');
  const sizes = await queryPBXPulsDb(
    `SELECT TABLE_NAME tableName,TABLE_ROWS estimatedRows,DATA_LENGTH dataBytes,INDEX_LENGTH indexBytes
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('directory_contacts','directory_contact_metadata')`
  );
  const indexes = await queryPBXPulsDb(
    `SELECT TABLE_NAME tableName,INDEX_NAME indexName,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) columns
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('directory_contacts','directory_contact_metadata')
     GROUP BY TABLE_NAME,INDEX_NAME ORDER BY TABLE_NAME,INDEX_NAME`
  );
  const existing = new Set(indexes.map(row => String(row.indexName)));
  const pending = recommendations.filter(item => !existing.has(item.name));
  console.log(JSON.stringify({
    previewOnly: true,
    applied: false,
    databaseVersion: version[0]?.version || null,
    tables: sizes,
    existingIndexes: indexes,
    recommendations: pending.map(item => ({
      ...item,
      rollbackSql: `ALTER TABLE directory_contacts DROP INDEX ${item.name}`,
    })),
    expectedLock: 'HIGH: MariaDB 5.5 may rebuild and lock the table; schedule a maintenance window and verify online DDL support first.',
    rollbackPlan: 'Drop only the newly added named indexes after verifying no production query depends on them.',
  }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ previewOnly: true, applied: false, error: String(error?.message || error).slice(0, 300) }));
  process.exitCode = 1;
});
