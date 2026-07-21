import { queryPBXPulsDb, sanitizePBXPulsDbError } from '../pbxpulsDb.js';
import { writePBXPulsSystemEvent } from '../pbxpulsEvents.js';
import { buildOverview, buildSecurityChecks, classifyListeningPortExposure, collectFail2Ban, collectFirewall, collectListeningPorts, collectOsDiscovery, collectRecentLogEvents, collectServices, securityLogSourceKey } from './collectors.js';
import { cleanupSecurityRetention, getSecuritySettings, saveSecurityChecks, toSecuritySqlDate, upsertSecurityEvent } from './storage.js';
import { listThreatActivity } from './threatActivity.js';

type Snapshot = any;
let cached: { expiresAt: number; value: Snapshot } | null = null;
let collecting: Promise<Snapshot> | null = null;
let systemTimer: NodeJS.Timeout | null = null;let eventTimer:NodeJS.Timeout|null=null;let lastEventPoll=0;
let eventCollecting=false;
const runtime = { running: false, activeJobs: [] as string[], lastSuccessfulRuns: {} as Record<string,string>, lastErrors: {} as Record<string,string>, startedAt: null as string|null };

async function counts24h() {
  try {
    const rows = await queryPBXPulsDb(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) AS critical,
      COUNT(DISTINCT CASE WHEN is_private_ip=0 AND source_ip IS NOT NULL THEN source_ip END) AS externalIps
      FROM security_events WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
    return { events24h: Number(rows[0]?.total || 0), criticalEvents24h: Number(rows[0]?.critical || 0), externalIps24h: Number(rows[0]?.externalIps || 0) };
  } catch { return { events24h: null, criticalEvents24h: null, externalIps24h: null }; }
}

export async function collectSecuritySnapshot(force = false): Promise<Snapshot> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (collecting) return collecting;
  collecting = (async () => {
    runtime.activeJobs = ['discovery','ports','firewall','fail2ban','services'];
    const generatedAt = new Date().toISOString();
    const settled = await Promise.allSettled([collectOsDiscovery(), collectListeningPorts(), collectFirewall(), collectFail2Ban()]);
    const value = (index:number, fallback:any) => settled[index].status === 'fulfilled' ? (settled[index] as PromiseFulfilledResult<any>).value : fallback;
    const discovery = value(0, { status:'unknown', tools:{} });
    const ports = value(1, { status:'unknown', ports:[], error:'Сбор портов завершился ошибкой' });
    const firewall = value(2, { status:'unknown', mechanism:'unknown', active:null, rules:[] });
    const fail2ban = value(3, { status:'unknown', installed:null, activeJails:null, currentlyBanned:null, jails:[] });
    if(Array.isArray(ports.ports))ports.ports=classifyListeningPortExposure(ports.ports,firewall);
    const services = await collectServices(ports.ports || []).catch(() => ({ status:'unknown',services:[] }));
    const checks = buildSecurityChecks({ firewall, fail2ban, ports: ports.ports || [], services: services.services || [] });
    try { await saveSecurityChecks(checks); delete runtime.lastErrors.database; } catch (error:any) { runtime.lastErrors.database = sanitizePBXPulsDbError(error); }
    const snapshot = { generatedAt, discovery, ports, firewall, fail2ban, services, checks, ...(await counts24h()) };
    cached = { expiresAt: Date.now() + 15_000, value: snapshot };
    runtime.lastSuccessfulRuns.snapshot = generatedAt; runtime.activeJobs = [];
    return snapshot;
  })().finally(() => { collecting = null; runtime.activeJobs = []; });
  return collecting;
}

async function collectEventsJob() {
  if(eventCollecting)return;eventCollecting=true;
  runtime.activeJobs.push('events');
  try {
    const cursorRows = await queryPBXPulsDb('SELECT source_key, source_type, source_path, last_size, last_mtime, inode_value FROM security_event_sources WHERE active=1');
    const cursors = Object.fromEntries(cursorRows.map((row:any) => [String(row.source_key), {
      lastSize: Number(row.last_size || 0),
      lastMtime: row.last_mtime ? new Date(row.last_mtime).toISOString() : undefined,
      inode: row.inode_value ? String(row.inode_value) : undefined
    }]));
    const { events, sources } = await collectRecentLogEvents(cursors);
    const outcomes=new Map<string,{created:number;updated:number}>();
    for (const event of events) {const outcome=await upsertSecurityEvent(event);const key=securityLogSourceKey(event.source,event.sourceFile||'');const current=outcomes.get(key)||{created:0,updated:0};current[outcome]+=1;outcomes.set(key,current);}
    for (const source of sources) {
      const sourceKey=securityLogSourceKey(source.source,source.path);await queryPBXPulsDb(`INSERT INTO security_event_sources
        (source_key, source_type, source_path, status, active, collector_version, inode_value, last_size, last_mtime, last_success_at, last_error)
        VALUES (?, ?, ?, ?, 1, '2', ?, ?, ?, NOW(), NULL)
        ON DUPLICATE KEY UPDATE source_key=VALUES(source_key),status=VALUES(status),active=1,collector_version='2',inode_value=VALUES(inode_value),last_size=VALUES(last_size),last_mtime=VALUES(last_mtime),last_success_at=NOW(),last_error=NULL`,
        [sourceKey,source.source,source.path,source.status,source.inode||null,source.size||0,source.mtime?source.mtime.slice(0,19).replace('T',' '):null]);
      const sourceRows=await queryPBXPulsDb('SELECT id FROM security_event_sources WHERE source_type=? AND source_path=? AND active=1 LIMIT 1',[source.source,source.path]);const sourceId=Number(sourceRows[0]?.id||0);const outcome=outcomes.get(sourceKey)||{created:0,updated:0};
      if(sourceId)await queryPBXPulsDb(`INSERT INTO security_event_source_stats
        (source_id,bucket_start,lines_read,events_parsed,events_created,events_updated,last_event_at)
        VALUES (?,DATE_FORMAT(NOW(),'%Y-%m-%d %H:00:00'),?,?,?,?,?)
        ON DUPLICATE KEY UPDATE lines_read=lines_read+VALUES(lines_read),events_parsed=events_parsed+VALUES(events_parsed),events_created=events_created+VALUES(events_created),events_updated=events_updated+VALUES(events_updated),last_event_at=CASE WHEN VALUES(last_event_at) IS NULL THEN last_event_at WHEN last_event_at IS NULL THEN VALUES(last_event_at) ELSE GREATEST(last_event_at,VALUES(last_event_at)) END`,
        [sourceId,Number(source.linesRead||0),Number(source.linesParsed||0),outcome.created,outcome.updated,toSecuritySqlDate(source.lastEventAt)]);
    }
    runtime.lastSuccessfulRuns.events = new Date().toISOString();
  } catch (error:any) { runtime.lastErrors.events = sanitizePBXPulsDbError(error); }
  finally { eventCollecting=false;runtime.activeJobs = runtime.activeJobs.filter(job => job !== 'events'); }
}

async function collectorTick() {
  const settings = await getSecuritySettings(); if (settings['security.enabled'] !== true) return;
  await collectSecuritySnapshot(true); await collectEventsJob();
  try { await cleanupSecurityRetention(); runtime.lastSuccessfulRuns.retention = new Date().toISOString(); } catch (error:any) { runtime.lastErrors.retention = sanitizePBXPulsDbError(error); }
}

export function startSecurityCollector() {
  if (systemTimer || eventTimer || runtime.running) return;
  runtime.running = true; runtime.startedAt = new Date().toISOString();
  setTimeout(() => collectorTick().catch(error => { runtime.lastErrors.collector = sanitizePBXPulsDbError(error); }), 5000).unref();
  systemTimer = setInterval(() => collectorTick().catch(error => { runtime.lastErrors.collector = sanitizePBXPulsDbError(error); }), 60_000);systemTimer.unref();
  eventTimer=setInterval(async()=>{try{const settings=await getSecuritySettings();const interval=Math.max(5,Number(settings['security.log_poll_interval_seconds']||15))*1000;if(settings['security.enabled']===true&&Date.now()-lastEventPoll>=interval){lastEventPoll=Date.now();await collectEventsJob();}}catch(error:any){runtime.lastErrors.events=sanitizePBXPulsDbError(error);}},5000);eventTimer.unref();
  writePBXPulsSystemEvent({ event_type:'security_collector_started', severity:'info', source:'security', message:'Security collector started' }).catch(() => undefined);
}

export async function getSecurityStatus() {
  const settings = await getSecuritySettings(); const snapshot = await collectSecuritySnapshot();
  return { enabled: settings['security.enabled'] === true, collector: { ...runtime }, databaseStatus: runtime.lastErrors.database ? 'degraded' : 'available',
    discoveredTools: snapshot.discovery?.tools || {}, detectedOS: snapshot.discovery || null, detectedFirewall: snapshot.firewall?.mechanism || 'unknown',
    detectedAsteriskChannelDrivers: ['PJSIP','chan_sip'], geoIpAvailability: 'not_available', fail2banManagementEnabled: false,
    logCursors: {}, generatedAt: new Date().toISOString() };
}

export async function getSecurityOverview() { const overview=buildOverview(await collectSecuritySnapshot());try{return{...overview,activeThreats:(await listThreatActivity({minutes:5,limit:5})).rows.slice(0,5)};}catch{return{...overview,activeThreats:[]};} }
