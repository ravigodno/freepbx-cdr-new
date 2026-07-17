import { queryPBXPulsDb, sanitizePBXPulsDbError } from '../pbxpulsDb.js';
import { writePBXPulsSystemEvent } from '../pbxpulsEvents.js';
import { buildOverview, buildSecurityChecks, classifyListeningPortExposure, collectFail2Ban, collectFirewall, collectListeningPorts, collectOsDiscovery, collectRecentLogEvents, collectServices, securityLogSourceKey } from './collectors.js';
import { cleanupSecurityRetention, getSecuritySettings, saveSecurityChecks, upsertSecurityEvent } from './storage.js';
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
    try { await saveSecurityChecks(checks); } catch (error:any) { runtime.lastErrors.database = sanitizePBXPulsDbError(error); }
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
    const cursorRows = await queryPBXPulsDb('SELECT source_key, last_size, last_mtime FROM security_event_sources');
    const cursors = Object.fromEntries(cursorRows.map((row:any) => [String(row.source_key), {
      lastSize: Number(row.last_size || 0),
      lastMtime: row.last_mtime ? new Date(row.last_mtime).toISOString() : undefined
    }]));
    const { events, sources } = await collectRecentLogEvents(cursors);
    for (const event of events) await upsertSecurityEvent(event);
    for (const source of sources) await queryPBXPulsDb(`INSERT INTO security_event_sources
      (source_key, source_type, source_path, status, last_size, last_mtime, last_success_at, last_error)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NULL)
      ON DUPLICATE KEY UPDATE status=VALUES(status), last_size=VALUES(last_size), last_mtime=VALUES(last_mtime), last_success_at=NOW(), last_error=NULL`,
      [securityLogSourceKey(source.source,source.path), source.source, source.path, source.status, source.size || null, source.mtime ? source.mtime.slice(0, 19).replace('T', ' ') : null]);
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
