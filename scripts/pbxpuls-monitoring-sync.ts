import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import { getPBXPulsDbConfig, getPBXPulsDbConnectionOptions } from '../server/pbxpulsDbConfig.js';
import { sanitizePBXPulsDbError } from '../server/pbxpulsDb.js';
import { syncLegacyDevicesMonitoringData } from '../server/monitoringSqlStorage.js';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

async function main() {
  if (!getPBXPulsDbConfig().configured) throw new Error('PBXPuls DB access denied / not configured');
  const connection = await mysql.createConnection(getPBXPulsDbConnectionOptions());
  try {
    await connection.beginTransaction();
    const results = await syncLegacyDevicesMonitoringData(connection);
    await connection.commit();
    console.log(JSON.stringify({
      success: true,
      modeChanged: false,
      results,
      totals: results.reduce((totals, item) => ({
        found: totals.found + item.found,
        imported: totals.imported + item.imported,
        skipped: totals.skipped + item.skipped
      }), { found: 0, imported: 0, skipped: 0 })
    }, null, 2));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(sanitizePBXPulsDbError(error));
  process.exitCode = 1;
});
