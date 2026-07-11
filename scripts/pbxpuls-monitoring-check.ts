import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
const files = ['quality-history.json','quality-alerts.json','health-history.json','devices-history.json','devices-alerts.json','devices-conflicts.json','devices-map.json'];
const tables: Array<[string,string]> = [['quality_current','updated_at'],['quality_history','sampled_at'],['monitoring_health_history','sampled_at'],['monitoring_quality_alerts','alert_time'],['monitoring_devices_history','sampled_at'],['monitoring_devices_alerts','alert_time'],['monitoring_devices_conflicts','last_seen_at'],['monitoring_devices_map','updated_at']];

async function main() {
  const config = { host: process.env.PBXPULS_DB_HOST || '127.0.0.1', port: Number(process.env.PBXPULS_DB_PORT || 3306), database: process.env.PBXPULS_DB_NAME || 'pbxpuls', user: process.env.PBXPULS_DB_USER || 'pbxpuls', password: process.env.PBXPULS_DB_PASSWORD || process.env.PBXPULS_DB_PASS || '', connectTimeout: 3000, dateStrings: true };
  const legacyFiles = Object.fromEntries(files.map(file => { const full=path.join(process.cwd(),'data',file); let count=0; try { const value=JSON.parse(fs.readFileSync(full,'utf8')||'[]'); count=Array.isArray(value)?value.length:0; } catch {} return [file,{found:fs.existsSync(full),count}]; }));
  const connection = await mysql.createConnection(config);
  const [modeRows] = await connection.execute("SELECT setting_value FROM settings WHERE setting_key='monitoring.storage_mode' LIMIT 1");
  const sqlTables:any = {};
  for (const [table,column] of tables) { const [rows] = await connection.query(`SELECT COUNT(*) count, MIN(${column}) minTimestamp, MAX(${column}) maxTimestamp FROM ${table}`); sqlTables[table]=(rows as any[])[0]; }
  await connection.end();
  console.log(JSON.stringify({ mode:(modeRows as any[])[0]?.setting_value || null, legacyFiles, sqlTables },null,2));
}
main().catch(error=>{console.error(String(error?.message||error).replace(/(password|passwd)\s*[:=]\s*\S+/gi,'$1=********'));process.exitCode=1;});
