import fs from 'fs';
import path from 'path';
import type { Connection } from 'mysql2/promise';
import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { getPBXPulsSetting, upsertPBXPulsSetting } from './pbxpulsSettings.js';

export type MonitoringStorageMode = 'legacy' | 'dual' | 'sql';
export type MonitoringSource = 'sql' | 'legacy' | 'legacy-fallback';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILES = {
  qualityHistory: 'quality-history.json', qualityAlerts: 'quality-alerts.json', healthHistory: 'health-history.json',
  devicesHistory: 'devices-history.json', devicesAlerts: 'devices-alerts.json', devicesConflicts: 'devices-conflicts.json', devicesMap: 'devices-map.json'
} as const;
const TABLES = ['quality_current', 'quality_history', 'monitoring_health_history', 'monitoring_quality_alerts',
  'monitoring_devices_history', 'monitoring_devices_alerts', 'monitoring_devices_conflicts', 'monitoring_devices_map'] as const;
export const MONITORING_DIRECT_LEGACY_READS_REMAINING: string[] = [];
const SQL_TIMEOUT_MS = 8000;
const MAX_READ_ROWS = 10000;
let lastWriteStatus: any = null;
let fallbackUsed = false;

function filePath(name: keyof typeof FILES): string { return path.join(DATA_DIR, FILES[name]); }
export function readLegacyMonitoringFile(name: keyof typeof FILES): any[] {
  try { const parsed = JSON.parse(fs.readFileSync(filePath(name), 'utf8') || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function dateValue(value: any): string | null {
  const d = new Date(String(value || '')); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19).replace('T', ' ') : null;
}
function num(value: any): number | null { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value: any, fallback = ''): string { return String(value ?? fallback).trim(); }
function raw(value: any): string { try { return JSON.stringify(value); } catch { return '{}'; } }
function sqlDateToIso(value: any): string { const normalized=String(value||'').replace(' ','T'); return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized)?normalized:normalized+'Z').toISOString(); }
function periodStart(period = '24h'): string {
  const map: Record<string, number> = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
  return new Date(Date.now() - (map[period] || map['24h'])).toISOString().slice(0, 19).replace('T', ' ');
}
async function timedQuery(sql: string, params: any[] = []): Promise<any[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([queryPBXPulsDb(sql, params), new Promise<any[]>((_, reject) => { timer = setTimeout(() => reject(new Error('Monitoring SQL timeout')), SQL_TIMEOUT_MS); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function markWrite(domain: string, ok: boolean, error?: any) { lastWriteStatus = { domain, ok, at: new Date().toISOString(), error: error ? sanitizePBXPulsDbError(error) : null }; }

export async function getMonitoringStorageMode(): Promise<MonitoringStorageMode> {
  const mode = await getPBXPulsSetting<string>('monitoring.storage_mode', 'dual');
  return mode === 'legacy' || mode === 'sql' ? mode : 'dual';
}
export async function setMonitoringStorageMode(mode: MonitoringStorageMode): Promise<boolean> {
  return upsertPBXPulsSetting('monitoring.storage_mode', mode, { valueType: 'string', category: 'monitoring', description: 'Controls monitoring storage: legacy, dual or sql' });
}

export async function readQualityHistoryFromSql(period = '24h', ext = 'all'): Promise<any[]> {
  const params: any[] = [periodStart(period)]; let extSql = '';
  if (ext && ext !== 'all') { extSql = ' AND ext = ?'; params.push(ext); }
  const rows = await timedQuery(`SELECT ext,name,status,quality_status,latency_ms,jitter_ms,rtp_loss,mos,sampled_at FROM quality_history WHERE sampled_at >= ?${extSql} ORDER BY sampled_at ASC LIMIT ${MAX_READ_ROWS}`, params);
  return rows.map((r: any) => ({ ext: String(r.ext), name: r.name || '', status: r.status || '', qualityStatus: r.quality_status || '', latency: Number(r.latency_ms || 0), jitter: Number(r.jitter_ms || 0), rtpLoss: Number(r.rtp_loss || 0), mos: Number(r.mos || 0), timestamp: sqlDateToIso(r.sampled_at) }));
}
export async function appendQualityHistoryToSql(items: any[]): Promise<void> {
  if (!items.length) return; try { for (const p of items) { const at = dateValue(p.timestamp || p.sampled_at); if (!at) continue; const ext = text(p.ext || p.deviceId || p.endpoint || p.name, 'unknown') || 'unknown'; await timedQuery(`INSERT IGNORE INTO quality_history (ext,name,status,quality_status,latency_ms,jitter_ms,rtp_loss,mos,sampled_at) VALUES (?,?,?,?,?,?,?,?,?)`, [ext,text(p.name),text(p.status),text(p.qualityStatus || p.quality_status),num(p.latency ?? p.latency_ms) || 0,num(p.jitter ?? p.jitter_ms) || 0,num(p.rtpLoss ?? p.rtp_loss) || 0,num(p.mos) || 0,at]); } markWrite('quality_history', true); } catch (e) { markWrite('quality_history', false, e); throw e; }
}
export async function writeQualityCurrentToSql(items: any[]): Promise<void> {
  if (!items.length) return; try { for (const p of items) await timedQuery(`INSERT INTO quality_current (ext,name,device_role,type_label,tech,ip,port,status,quality_status,latency_ms,jitter_ms,rtp_loss,mos,user_agent,manufacturer,model) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),device_role=VALUES(device_role),type_label=VALUES(type_label),tech=VALUES(tech),ip=VALUES(ip),port=VALUES(port),status=VALUES(status),quality_status=VALUES(quality_status),latency_ms=VALUES(latency_ms),jitter_ms=VALUES(jitter_ms),rtp_loss=VALUES(rtp_loss),mos=VALUES(mos),user_agent=VALUES(user_agent),manufacturer=VALUES(manufacturer),model=VALUES(model)`, [text(p.ext),text(p.name),text(p.deviceRole,'extension'),text(p.typeLabel),text(p.tech || p.type),text(p.ip),num(p.port),text(p.deviceStatus || p.status),text(p.qualityStatus || p.status),num(p.latency)||0,num(p.jitter)||0,num(p.rtpLoss)||0,num(p.mos)||0,text(p.userAgent),text(p.manufacturer),text(p.model)]); markWrite('quality_current', true); } catch(e){ markWrite('quality_current',false,e); throw e; }
}
export async function readQualityAlertsFromSql(): Promise<any[]> { const rows=await timedQuery(`SELECT * FROM monitoring_quality_alerts ORDER BY alert_time DESC LIMIT 1000`); return rows.map((r:any)=>({id:String(r.id),time:sqlDateToIso(r.alert_time),ext:r.ext,name:r.name,type:r.type,severity:r.severity,message:r.message,value:r.value})); }
export async function appendQualityAlertsToSql(items:any[]):Promise<void>{for(const p of items){const at=dateValue(p.time||p.timestamp||p.alert_time);if(!at)continue;await timedQuery(`INSERT IGNORE INTO monitoring_quality_alerts (alert_time,ext,name,type,severity,message,value,threshold_value,raw_json) VALUES (?,?,?,?,?,?,?,?,?)`,[at,text(p.ext),text(p.name),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),num(p.value),num(p.threshold),raw(p)]);}markWrite('quality_alerts',true);}
function mapHealthHistoryRow(r:any):any{return{timestamp:sqlDateToIso(r.sampled_at),bootId:r.boot_id,uptimeSeconds:Number(r.uptime_seconds||0),load1:Number(r.load1||0),load5:Number(r.load5||0),load15:Number(r.load15||0),cpuPercent:Number(r.cpu_percent||0),memoryPercent:Number(r.memory_percent||0),swapPercent:Number(r.swap_percent||0),diskRootPercent:Number(r.disk_root_percent||0),internet:{googleAvgMs:num(r.internet_google_avg_ms),googleLoss:num(r.internet_google_loss),yandexAvgMs:num(r.internet_yandex_avg_ms),yandexLoss:num(r.internet_yandex_loss)},network:{iface:r.network_iface||'',rxKbps:Number(r.network_rx_kbps||0),txKbps:Number(r.network_tx_kbps||0),rxBytes:Number(r.network_rx_bytes||0),txBytes:Number(r.network_tx_bytes||0)},asterisk:{activeChannels:Number(r.asterisk_active_channels||0),activeCalls:Number(r.asterisk_active_calls||0)}};}
export async function readHealthHistoryFromSql(period='24h'):Promise<any[]>{const rows=await timedQuery(`SELECT * FROM (SELECT * FROM monitoring_health_history WHERE sampled_at>=? ORDER BY sampled_at DESC LIMIT ${MAX_READ_ROWS}) recent_health ORDER BY sampled_at ASC`,[periodStart(period)]);return rows.map(mapHealthHistoryRow);}
export async function readLatestHealthHistoryFromSql():Promise<any[]>{const rows=await timedQuery('SELECT * FROM monitoring_health_history ORDER BY sampled_at DESC LIMIT 1');return rows.map(mapHealthHistoryRow);}
export async function appendHealthHistoryToSql(p:any):Promise<void>{const at=dateValue(p.timestamp);if(!at)return;await timedQuery(`INSERT IGNORE INTO monitoring_health_history (sampled_at,boot_id,uptime_seconds,load1,load5,load15,cpu_percent,memory_percent,swap_percent,disk_root_percent,internet_google_avg_ms,internet_google_loss,internet_yandex_avg_ms,internet_yandex_loss,network_iface,network_rx_kbps,network_tx_kbps,network_rx_bytes,network_tx_bytes,asterisk_active_channels,asterisk_active_calls) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[at,text(p.bootId),num(p.uptimeSeconds),num(p.load1),num(p.load5),num(p.load15),num(p.cpuPercent),num(p.memoryPercent),num(p.swapPercent),num(p.diskRootPercent),num(p.internet?.googleAvgMs),num(p.internet?.googleLoss),num(p.internet?.yandexAvgMs),num(p.internet?.yandexLoss),text(p.network?.iface),num(p.network?.rxKbps),num(p.network?.txKbps),num(p.network?.rxBytes),num(p.network?.txBytes),num(p.asterisk?.activeChannels),num(p.asterisk?.activeCalls)]);markWrite('health_history',true);}
export async function readDevicesHistoryFromSql():Promise<any[]>{const rows=await timedQuery(`SELECT * FROM monitoring_devices_history ORDER BY sampled_at ASC LIMIT ${MAX_READ_ROWS}`);return rows.map((r:any)=>({...JSON.parse(r.raw_json||'{}'),ext:r.device_id,timestamp:sqlDateToIso(r.sampled_at)}));}
export async function appendDevicesHistoryToSql(items:any[]):Promise<void>{for(const p of items){const at=dateValue(p.timestamp||p.sampled_at);if(!at)continue;await timedQuery(`INSERT IGNORE INTO monitoring_devices_history (device_id,sampled_at,status,ip,port,tech,user_agent,manufacturer,model,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,[text(p.ext||p.deviceId,'unknown'),at,text(p.status),text(p.ip),num(p.port),text(p.tech),text(p.userAgent),text(p.manufacturer),text(p.model),raw(p)]);}markWrite('devices_history',true);}
export async function readDevicesAlertsFromSql():Promise<any[]>{const rows=await timedQuery(`SELECT raw_json FROM monitoring_devices_alerts ORDER BY alert_time DESC LIMIT 1000`);return rows.map((r:any)=>JSON.parse(r.raw_json||'{}'));}
export async function appendDevicesAlertsToSql(items:any[]):Promise<void>{for(const p of items){const at=dateValue(p.time||p.timestamp||p.alert_time);if(!at)continue;await timedQuery(`INSERT IGNORE INTO monitoring_devices_alerts (alert_time,device_id,type,severity,message,raw_json) VALUES (?,?,?,?,?,?)`,[at,text(p.ext||p.deviceId),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),raw(p)]);}markWrite('devices_alerts',true);}
export async function readDevicesMapFromSql():Promise<any[]>{const rows=await timedQuery(`SELECT raw_json FROM monitoring_devices_map ORDER BY device_id LIMIT ${MAX_READ_ROWS}`);return rows.map((r:any)=>JSON.parse(r.raw_json||'{}'));}
export async function upsertDevicesMapToSql(items:any[]):Promise<void>{for(const p of items)await timedQuery(`INSERT INTO monitoring_devices_map (device_id,name,ip,port,tech,manufacturer,model,user_agent,raw_json) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),ip=VALUES(ip),port=VALUES(port),tech=VALUES(tech),manufacturer=VALUES(manufacturer),model=VALUES(model),user_agent=VALUES(user_agent),raw_json=VALUES(raw_json)`,[text(p.ext||p.deviceId,'unknown'),text(p.name),text(p.ip),num(p.port),text(p.tech),text(p.manufacturer),text(p.model),text(p.userAgent),raw(p)]);markWrite('devices_map',true);}
export async function readDevicesConflictsFromSql():Promise<any[]>{const rows=await timedQuery(`SELECT raw_json FROM monitoring_devices_conflicts ORDER BY last_seen_at DESC LIMIT 1000`);return rows.map((r:any)=>JSON.parse(r.raw_json||'{}'));}
export async function upsertDevicesConflictsToSql(items:any[]):Promise<void>{for(const p of items){const key=text(p.id||p.conflictKey||[p.type,p.ip,p.ext,Array.isArray(p.devices)?p.devices.join(','):''].join(':'))||'unknown';const at=dateValue(p.detectedAt||p.timestamp||p.lastSeenAt)||dateValue(new Date());await timedQuery(`INSERT INTO monitoring_devices_conflicts (conflict_key,first_seen_at,last_seen_at,status,raw_json) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),status=VALUES(status),raw_json=VALUES(raw_json)`,[key,dateValue(p.firstSeenAt)||at,at,text(p.status),raw(p)]);}markWrite('devices_conflicts',true);}

export async function readWithMonitoringFallback<T>(sqlRead:()=>Promise<T[]>, legacyRead:()=>T[]):Promise<{data:T[];source:MonitoringSource;error?:string}>{const mode=await getMonitoringStorageMode();if(mode==='legacy')return{data:legacyRead(),source:'legacy'};try{const data=await sqlRead();if(data.length||mode==='sql')return{data,source:'sql'};fallbackUsed=true;return{data:legacyRead(),source:'legacy-fallback'};}catch(e:any){fallbackUsed=true;return{data:legacyRead(),source:'legacy-fallback',error:sanitizePBXPulsDbError(e)};}}

export interface ImportResult { file:string; found:number; imported:number; skipped:number; error?:string }

export async function syncLegacyDevicesMonitoringData(connection: Connection): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const run = async (name: keyof typeof FILES, sync: (item: any) => Promise<boolean>) => {
    const items = readLegacyMonitoringFile(name);
    let imported = 0;
    for (const item of items) {
      if (await sync(item)) imported += 1;
    }
    results.push({ file: FILES[name], found: items.length, imported, skipped: items.length - imported });
  };
  const changed = (result: any) => Number(result?.affectedRows || 0) > 0;
  const execute = async (sql: string, params: any[]) => {
    const [result] = await connection.execute(sql, params);
    return result;
  };

  await run('devicesHistory', async item => {
    const sampledAt = dateValue(item.timestamp || item.sampled_at);
    if (!sampledAt) return false;
    return changed(await execute(
      `INSERT IGNORE INTO monitoring_devices_history
        (device_id,sampled_at,status,ip,port,tech,user_agent,manufacturer,model,raw_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [text(item.ext || item.deviceId, 'unknown'), sampledAt, text(item.status), text(item.ip), num(item.port),
        text(item.tech), text(item.userAgent), text(item.manufacturer), text(item.model), raw(item)]
    ));
  });
  await run('devicesAlerts', async item => {
    const alertTime = dateValue(item.time || item.timestamp || item.alert_time);
    if (!alertTime) return false;
    return changed(await execute(
      `INSERT IGNORE INTO monitoring_devices_alerts
        (alert_time,device_id,type,severity,message,raw_json) VALUES (?,?,?,?,?,?)`,
      [alertTime, text(item.ext || item.deviceId), text(item.type, 'unknown'), text(item.severity),
        text(item.message || item.description), raw(item)]
    ));
  });
  await run('devicesConflicts', async item => {
    const conflictKey = text(item.id || item.conflictKey || [item.type, item.ip, item.ext, Array.isArray(item.devices) ? item.devices.join(',') : ''].join(':')) || 'unknown';
    const lastSeenAt = dateValue(item.detectedAt || item.timestamp || item.lastSeenAt);
    if (!lastSeenAt) return false;
    const firstSeenAt = dateValue(item.firstSeenAt) || lastSeenAt;
    const [rows] = await connection.execute(
      'SELECT last_seen_at FROM monitoring_devices_conflicts WHERE conflict_key = ? LIMIT 1',
      [conflictKey]
    );
    const existing = Array.isArray(rows) ? (rows as any[])[0] : null;
    const existingLastSeenAt = String(existing?.last_seen_at || '').replace('T', ' ').slice(0, 19);
    if (existing && existingLastSeenAt >= lastSeenAt) return false;
    if (existing) {
      return changed(await execute(
        `UPDATE monitoring_devices_conflicts
         SET first_seen_at=LEAST(COALESCE(first_seen_at,?),?),last_seen_at=?,status=?,raw_json=?
         WHERE conflict_key=?`,
        [firstSeenAt, firstSeenAt, lastSeenAt, text(item.status), raw(item), conflictKey]
      ));
    }
    return changed(await execute(
      `INSERT INTO monitoring_devices_conflicts
        (conflict_key,first_seen_at,last_seen_at,status,raw_json) VALUES (?,?,?,?,?)`,
      [conflictKey, firstSeenAt, lastSeenAt, text(item.status), raw(item)]
    ));
  });
  await run('devicesMap', async item => changed(await execute(
    `INSERT IGNORE INTO monitoring_devices_map
      (device_id,name,ip,port,tech,manufacturer,model,user_agent,raw_json) VALUES (?,?,?,?,?,?,?,?,?)`,
    [text(item.ext || item.deviceId, 'unknown'), text(item.name), text(item.ip), num(item.port), text(item.tech),
      text(item.manufacturer), text(item.model), text(item.userAgent), raw(item)]
  )));

  return results;
}
export async function importLegacyMonitoringData(connection?:Connection):Promise<ImportResult[]>{
  if (connection) return importLegacyMonitoringDataBulk(connection);
  const exec=async(sql:string,params:any[])=>connection?(await connection.execute(sql,params))[0] as any:timedQuery(sql,params);
  const results:ImportResult[]=[];
  const run=async(name:keyof typeof FILES,insert:(p:any)=>Promise<boolean>)=>{const items=readLegacyMonitoringFile(name);let imported=0,skipped=0;try{for(const p of items)(await insert(p))?imported++:skipped++;results.push({file:FILES[name],found:items.length,imported,skipped});}catch(e:any){results.push({file:FILES[name],found:items.length,imported,skipped:items.length-imported,error:sanitizePBXPulsDbError(e)});}};
  const affected=(r:any)=>Number(r?.affectedRows||0)>0;
  await run('qualityHistory',async p=>{const at=dateValue(p.timestamp);if(!at)return false;const ext=text(p.ext||p.deviceId||p.endpoint||p.name,'unknown')||'unknown';return affected(await exec(`INSERT IGNORE INTO quality_history (ext,name,status,quality_status,latency_ms,jitter_ms,rtp_loss,mos,sampled_at) VALUES (?,?,?,?,?,?,?,?,?)`,[ext,text(p.name),text(p.status),text(p.qualityStatus),num(p.latency)||0,num(p.jitter)||0,num(p.rtpLoss)||0,num(p.mos)||0,at]));});
  await run('qualityAlerts',async p=>{const at=dateValue(p.time||p.timestamp);if(!at)return false;return affected(await exec(`INSERT IGNORE INTO monitoring_quality_alerts (alert_time,ext,name,type,severity,message,value,threshold_value,raw_json) VALUES (?,?,?,?,?,?,?,?,?)`,[at,text(p.ext),text(p.name),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),num(p.value),num(p.threshold),raw(p)]));});
  await run('healthHistory',async p=>{const at=dateValue(p.timestamp);if(!at)return false;return affected(await exec(`INSERT IGNORE INTO monitoring_health_history (sampled_at,boot_id,uptime_seconds,load1,load5,load15,cpu_percent,memory_percent,swap_percent,disk_root_percent,internet_google_avg_ms,internet_google_loss,internet_yandex_avg_ms,internet_yandex_loss,network_iface,network_rx_kbps,network_tx_kbps,network_rx_bytes,network_tx_bytes,asterisk_active_channels,asterisk_active_calls) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[at,text(p.bootId),num(p.uptimeSeconds),num(p.load1),num(p.load5),num(p.load15),num(p.cpuPercent),num(p.memoryPercent),num(p.swapPercent),num(p.diskRootPercent),num(p.internet?.googleAvgMs),num(p.internet?.googleLoss),num(p.internet?.yandexAvgMs),num(p.internet?.yandexLoss),text(p.network?.iface),num(p.network?.rxKbps),num(p.network?.txKbps),num(p.network?.rxBytes),num(p.network?.txBytes),num(p.asterisk?.activeChannels),num(p.asterisk?.activeCalls)]));});
  await run('devicesHistory',async p=>{const at=dateValue(p.timestamp);if(!at)return false;return affected(await exec(`INSERT IGNORE INTO monitoring_devices_history (device_id,sampled_at,status,ip,port,tech,user_agent,manufacturer,model,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,[text(p.ext||p.deviceId,'unknown'),at,text(p.status),text(p.ip),num(p.port),text(p.tech),text(p.userAgent),text(p.manufacturer),text(p.model),raw(p)]));});
  await run('devicesAlerts',async p=>{const at=dateValue(p.time||p.timestamp);if(!at)return false;return affected(await exec(`INSERT IGNORE INTO monitoring_devices_alerts (alert_time,device_id,type,severity,message,raw_json) VALUES (?,?,?,?,?,?)`,[at,text(p.ext||p.deviceId),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),raw(p)]));});
  await run('devicesConflicts',async p=>{const key=text(p.id||[p.type,p.ip,p.ext,Array.isArray(p.devices)?p.devices.join(','):''].join(':'))||'unknown';const at=dateValue(p.detectedAt||p.timestamp)||dateValue(new Date());return affected(await exec(`INSERT IGNORE INTO monitoring_devices_conflicts (conflict_key,first_seen_at,last_seen_at,status,raw_json) VALUES (?,?,?,?,?)`,[key,at,at,text(p.status),raw(p)]));});
  await run('devicesMap',async p=>affected(await exec(`INSERT INTO monitoring_devices_map (device_id,name,ip,port,tech,manufacturer,model,user_agent,raw_json) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),ip=VALUES(ip),port=VALUES(port),tech=VALUES(tech),manufacturer=VALUES(manufacturer),model=VALUES(model),user_agent=VALUES(user_agent),raw_json=VALUES(raw_json)`,[text(p.ext||p.deviceId,'unknown'),text(p.name),text(p.ip),num(p.port),text(p.tech),text(p.manufacturer),text(p.model),text(p.userAgent),raw(p)])));
  for(const r of results)console.log('[MONITORING_IMPORT]',r.file,'found='+r.found,'imported='+r.imported,'skipped='+r.skipped,r.error||'');return results;
}

async function importLegacyMonitoringDataBulk(connection: Connection): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const insert = async (name: keyof typeof FILES, prefix: string, columns: number, rows: any[][], suffix = '') => {
    let imported = 0;
    for (let offset = 0; offset < rows.length; offset += 250) {
      const chunk = rows.slice(offset, offset + 250);
      if (!chunk.length) continue;
      const placeholders = chunk.map(() => `(${new Array(columns).fill('?').join(',')})`).join(',');
      const [result] = await connection.execute(`${prefix} ${placeholders} ${suffix}`, chunk.flat());
      imported += Math.min(chunk.length, Number((result as any)?.affectedRows || 0));
    }
    const item = { file: FILES[name], found: rows.length, imported, skipped: rows.length - imported };
    results.push(item);
    console.log('[MONITORING_IMPORT]', item.file, 'found=' + item.found, 'imported=' + item.imported, 'skipped=' + item.skipped);
  };
  const qh = readLegacyMonitoringFile('qualityHistory').map(p => [text(p.ext||p.deviceId||p.endpoint||p.name,'unknown')||'unknown',text(p.name),text(p.status),text(p.qualityStatus),num(p.latency)||0,num(p.jitter)||0,num(p.rtpLoss)||0,num(p.mos)||0,dateValue(p.timestamp)]).filter(r=>r[8]);
  await insert('qualityHistory','INSERT IGNORE INTO quality_history (ext,name,status,quality_status,latency_ms,jitter_ms,rtp_loss,mos,sampled_at) VALUES',9,qh);
  const qa=readLegacyMonitoringFile('qualityAlerts').map(p=>[dateValue(p.time||p.timestamp),text(p.ext),text(p.name),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),num(p.value),num(p.threshold),raw(p)]).filter(r=>r[0]);
  await insert('qualityAlerts','INSERT IGNORE INTO monitoring_quality_alerts (alert_time,ext,name,type,severity,message,value,threshold_value,raw_json) VALUES',9,qa);
  const hh=readLegacyMonitoringFile('healthHistory').map(p=>[dateValue(p.timestamp),text(p.bootId),num(p.uptimeSeconds),num(p.load1),num(p.load5),num(p.load15),num(p.cpuPercent),num(p.memoryPercent),num(p.swapPercent),num(p.diskRootPercent),num(p.internet?.googleAvgMs),num(p.internet?.googleLoss),num(p.internet?.yandexAvgMs),num(p.internet?.yandexLoss),text(p.network?.iface),num(p.network?.rxKbps),num(p.network?.txKbps),num(p.network?.rxBytes),num(p.network?.txBytes),num(p.asterisk?.activeChannels),num(p.asterisk?.activeCalls)]).filter(r=>r[0]);
  await insert('healthHistory','INSERT IGNORE INTO monitoring_health_history (sampled_at,boot_id,uptime_seconds,load1,load5,load15,cpu_percent,memory_percent,swap_percent,disk_root_percent,internet_google_avg_ms,internet_google_loss,internet_yandex_avg_ms,internet_yandex_loss,network_iface,network_rx_kbps,network_tx_kbps,network_rx_bytes,network_tx_bytes,asterisk_active_channels,asterisk_active_calls) VALUES',21,hh);
  const dh=readLegacyMonitoringFile('devicesHistory').map(p=>[text(p.ext||p.deviceId,'unknown'),dateValue(p.timestamp),text(p.status),text(p.ip),num(p.port),text(p.tech),text(p.userAgent),text(p.manufacturer),text(p.model),raw(p)]).filter(r=>r[1]);
  await insert('devicesHistory','INSERT IGNORE INTO monitoring_devices_history (device_id,sampled_at,status,ip,port,tech,user_agent,manufacturer,model,raw_json) VALUES',10,dh);
  const da=readLegacyMonitoringFile('devicesAlerts').map(p=>[dateValue(p.time||p.timestamp),text(p.ext||p.deviceId),text(p.type,'unknown'),text(p.severity),text(p.message||p.description),raw(p)]).filter(r=>r[0]);
  await insert('devicesAlerts','INSERT IGNORE INTO monitoring_devices_alerts (alert_time,device_id,type,severity,message,raw_json) VALUES',6,da);
  const dc=readLegacyMonitoringFile('devicesConflicts').map(p=>{const key=text(p.id||[p.type,p.ip,p.ext,Array.isArray(p.devices)?p.devices.join(','):''].join(':'))||'unknown';const at=dateValue(p.detectedAt||p.timestamp)||dateValue(new Date());return[key,at,at,text(p.status),raw(p)];});
  await insert('devicesConflicts','INSERT IGNORE INTO monitoring_devices_conflicts (conflict_key,first_seen_at,last_seen_at,status,raw_json) VALUES',5,dc);
  const dm=readLegacyMonitoringFile('devicesMap').map(p=>[text(p.ext||p.deviceId,'unknown'),text(p.name),text(p.ip),num(p.port),text(p.tech),text(p.manufacturer),text(p.model),text(p.userAgent),raw(p)]);
  await insert('devicesMap','INSERT IGNORE INTO monitoring_devices_map (device_id,name,ip,port,tech,manufacturer,model,user_agent,raw_json) VALUES',9,dm);
  return results;
}

function legacyTimestampRange(items: any[]): { minTimestamp: string | null; maxTimestamp: string | null } {
  const timestamps = items
    .map(item => item?.timestamp || item?.time || item?.detectedAt || item?.lastSeenAt || item?.lastContact || item?.regTime)
    .map(value => new Date(String(value || '')).getTime())
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  return {
    minTimestamp: timestamps.length ? new Date(timestamps[0]).toISOString() : null,
    maxTimestamp: timestamps.length ? new Date(timestamps[timestamps.length - 1]).toISOString() : null
  };
}

function storedTimestampMs(value: unknown): number | null {
  const parsed = new Date(String(value || '').replace(' ', 'T')).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function sqlTimestampMs(table: string, value: unknown): number | null {
  const normalized = String(value || '').replace(' ', 'T');
  const parsed = new Date(table === 'monitoring_devices_map' ? normalized : `${normalized}Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getMonitoringStorageStatus() {
  const mode = await getMonitoringStorageMode();
  const tables: Record<string, any> = {};
  let sqlAvailable = true;

  for (const table of TABLES) {
    try {
      const timeColumn = table === 'quality_history' ? 'sampled_at'
        : table === 'monitoring_health_history' || table === 'monitoring_devices_history' ? 'sampled_at'
          : table.includes('alerts') ? 'alert_time'
            : table === 'monitoring_devices_conflicts' ? 'last_seen_at' : 'updated_at';
      const rows = await timedQuery(`SELECT COUNT(*) count, MIN(${timeColumn}) minTimestamp, MAX(${timeColumn}) maxTimestamp FROM ${table}`);
      tables[table] = rows[0];
    } catch (e: any) {
      sqlAvailable = false;
      tables[table] = { error: sanitizePBXPulsDbError(e) };
    }
  }

  const legacyFiles = Object.fromEntries(Object.entries(FILES).map(([key, file]) => {
    const items = readLegacyMonitoringFile(key as keyof typeof FILES);
    return [file, { found: fs.existsSync(filePath(key as keyof typeof FILES)), count: items.length, ...legacyTimestampRange(items) }];
  }));
  const coverage = [
    ['quality-history.json', 'quality_history'],
    ['quality-alerts.json', 'monitoring_quality_alerts'],
    ['health-history.json', 'monitoring_health_history'],
    ['devices-history.json', 'monitoring_devices_history'],
    ['devices-alerts.json', 'monitoring_devices_alerts'],
    ['devices-conflicts.json', 'monitoring_devices_conflicts'],
    ['devices-map.json', 'monitoring_devices_map']
  ] as const;
  const blockers: string[] = [];

  if (!sqlAvailable) blockers.push('monitoring_sql_unavailable');
  if (mode === 'legacy') blockers.push('monitoring_storage_mode_is_legacy');
  blockers.push(...MONITORING_DIRECT_LEGACY_READS_REMAINING.map(item => `direct_legacy_read:${item}`));
  for (const [file, table] of coverage) {
    const legacyCount = Number((legacyFiles as any)[file]?.count || 0);
    const sqlCount = Number(tables[table]?.count || 0);
    if (legacyCount > sqlCount) blockers.push(`sql_count_below_legacy:${table}`);
    const legacyMax = storedTimestampMs((legacyFiles as any)[file]?.maxTimestamp);
    const sqlMax = sqlTimestampMs(table, tables[table]?.maxTimestamp);
    if (legacyMax !== null && (sqlMax === null || sqlMax + 10 * 60 * 1000 < legacyMax)) {
      blockers.push(`sql_timestamp_behind_legacy:${table}`);
    }
  }
  if (Number((legacyFiles as any)['devices-map.json']?.count || 0) > 0 && Number(tables.quality_current?.count || 0) === 0) {
    blockers.push('quality_current_is_empty');
  }
  if (lastWriteStatus?.ok === false) blockers.push(`last_sql_write_failed:${lastWriteStatus.domain || 'unknown'}`);

  const cutoverReady = blockers.length === 0;
  return {
    mode,
    sqlAvailable,
    fallbackUsed,
    directLegacyReadsRemaining: MONITORING_DIRECT_LEGACY_READS_REMAINING,
    directLegacyReadCount: MONITORING_DIRECT_LEGACY_READS_REMAINING.length,
    cutoverReady,
    monitoringSqlCutoverReady: cutoverReady,
    blockers,
    legacyFiles,
    tables,
    lastWriteStatus
  };
}
