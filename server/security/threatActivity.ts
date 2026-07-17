import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { maskSecuritySecrets } from './sanitize.js';

export type ThreatActivityStatus='active'|'recent'|'ended'|'blocked'|'monitoring'|'unknown';
export type ThreatStreamState='collector_stopped'|'sources_unavailable'|'no_recent_threats'|'has_events';

function dateEpoch(value:unknown):number {
  if(!value)return Number.NaN;
  const text=String(value);const date=new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)?text.replace(' ','T'):text);
  return date.getTime();
}

export function calculateThreatActivityStatus(event:any,now=Date.now()):ThreatActivityStatus {
  if(event.result==='blocked'||event.category==='fail2ban_ban'||event.category==='firewall_drop')return'blocked';
  const last=dateEpoch(event.last_seen_at||event.lastSeenAt);if(!Number.isFinite(last))return'unknown';
  const age=(now-last)/1000,count=Number(event.occurrence_count||event.occurrenceCount||1);
  if(age<=30&&count>1)return'active';if(age<=30)return'monitoring';if(age<=120)return'recent';return'ended';
}

export function normalizeThreatRow(row:any,now=Date.now()) {
  const lastSeenAt=row.last_seen_at||row.lastSeenAt;const occurrenceCount=Number(row.occurrence_count||row.occurrenceCount||1);
  return {...row,lastSeenAt,occurrenceCount,sourcePath:row.source_file||row.sourcePath||null,title:maskSecuritySecrets(row.title||'',255),description:maskSecuritySecrets(row.description||'',1000),raw_excerpt:row.raw_excerpt?maskSecuritySecrets(row.raw_excerpt,2000):null,activityStatus:calculateThreatActivityStatus({...row,lastSeenAt},now)};
}

export function groupThreatsByIp(rows:any[]) {
  const groups=new Map<string,any[]>();for(const row of rows){const key=row.source_ip||'unknown';groups.set(key,[...(groups.get(key)||[]),row]);}
  return[...groups.entries()].map(([sourceIp,events])=>({sourceIp,activityStatus:events.some(e=>e.activityStatus==='blocked')?'blocked':events.some(e=>e.activityStatus==='active')?'active':events.some(e=>e.activityStatus==='monitoring')?'monitoring':events.some(e=>e.activityStatus==='recent')?'recent':'ended',attempts:events.reduce((sum,e)=>sum+Number(e.occurrence_count||1),0),eventGroups:events.length,categories:[...new Set(events.map(e=>e.category))],services:[...new Set(events.map(e=>e.service).filter(Boolean))],ports:[...new Set(events.map(e=>e.destination_port).filter(Boolean))],identities:[...new Set(events.flatMap(e=>[e.extension,e.username]).filter(Boolean))],firstSeenAt:events.map(e=>e.first_seen_at).sort()[0],lastSeenAt:events.map(e=>e.last_seen_at).sort().reverse()[0],blocked:events.some(e=>e.activityStatus==='blocked'),severity:['critical','high','medium','low','info'].find(level=>events.some(e=>e.severity===level))||'info',events})).sort((a,b)=>dateEpoch(b.lastSeenAt)-dateEpoch(a.lastSeenAt));
}

export function resolveThreatMinutes(query:any={}):number {
  const range=String(query.range||'').trim().toLowerCase();const rangeMinutes:{[key:string]:number}={'5m':5,'1h':60,'24h':1440};
  return Math.min(Math.max(rangeMinutes[range]||Number(query.minutes)||60,1),1440);
}

export function buildThreatWhere(query:any={}) {
  const where=['last_seen_at>=DATE_SUB(NOW(),INTERVAL ? MINUTE)'];const params:any[]=[resolveThreatMinutes(query)];
  for(const[field,column]of[['severity','severity'],['category','category'],['sourceIp','source_ip'],['service','service'],['protocol','protocol'],['extension','extension'],['username','username'],['jail','jail'],['result','result']]as const){const value=String(query[field]||'').trim();if(value){where.push(`${column}=?`);params.push(value);}}
  if(String(query.blocked||'')==='true')where.push("(result='blocked' OR category IN ('fail2ban_ban','firewall_drop'))");if(String(query.external||'')==='true')where.push('is_private_ip=0');
  const search=String(query.search||'').trim().slice(0,100);if(search){where.push('(title LIKE ? OR description LIKE ? OR source_ip LIKE ?)');params.push(`%${search}%`,`%${search}%`,`%${search}%`);}
  return{sql:where.join(' AND '),params};
}

export function getThreatStreamState(summary:any):ThreatStreamState {
  if(summary.collectorRunning!==true)return'collector_stopped';if(Number(summary.availableSources||0)===0)return'sources_unavailable';if(summary.lastEventAt)return'has_events';return'no_recent_threats';
}

export function summarizeRecentThreatRows(rows:any[]) {
  const normalized=rows.map(row=>normalizeThreatRow(row));const attempts5m=normalized.reduce((sum,row)=>sum+Number(row.occurrence_count||row.occurrenceCount||1),0);
  return{eventGroups5m:normalized.length,attempts5m};
}

export function mergeCanonicalSourceRows(rows:any[]) {
  const grouped=new Map<string,any[]>();for(const row of rows){const key=`${row.source_type}|${row.source_path}`;grouped.set(key,[...(grouped.get(key)||[]),row]);}
  return[...grouped.values()].map(items=>items.sort((a,b)=>dateEpoch(b.last_success_at)-dateEpoch(a.last_success_at))[0]);
}

export async function listThreatSources() {
  const rows=await queryPBXPulsDb(`SELECT s.id,s.source_type,s.source_path,s.status,s.collector_version,s.inode_value,s.last_size,s.last_mtime,s.last_success_at,s.last_error,
    COALESCE(ev.event_groups_last_hour,0) AS event_groups_last_hour,COALESCE(ev.occurrences_last_hour,0) AS occurrences_last_hour,ev.last_recognized_event_at,
    COALESCE(st.lines_read_last_hour,0) AS lines_read_last_hour,COALESCE(st.events_parsed_last_hour,0) AS events_parsed_last_hour,
    COALESCE(st.events_created_last_hour,0) AS events_created_last_hour,COALESCE(st.events_updated_last_hour,0) AS events_updated_last_hour
    FROM security_event_sources s
    LEFT JOIN (SELECT source,source_file,COUNT(*) event_groups_last_hour,SUM(occurrence_count) occurrences_last_hour,MAX(last_seen_at) last_recognized_event_at FROM security_events WHERE last_seen_at>=DATE_SUB(NOW(),INTERVAL 1 HOUR) GROUP BY source,source_file) ev ON ev.source=s.source_type AND ev.source_file=s.source_path
    LEFT JOIN (SELECT source_id,SUM(lines_read) lines_read_last_hour,SUM(events_parsed) events_parsed_last_hour,SUM(events_created) events_created_last_hour,SUM(events_updated) events_updated_last_hour FROM security_event_source_stats WHERE bucket_start>=DATE_FORMAT(DATE_SUB(NOW(),INTERVAL 1 HOUR),'%Y-%m-%d %H:00:00') GROUP BY source_id) st ON st.source_id=s.id
    WHERE s.active=1 ORDER BY s.source_type,s.source_path`);
  return rows.map((row:any)=>({...row,available:row.status==='available',last_error:row.last_error?maskSecuritySecrets(row.last_error,500):null}));
}

export async function listThreatActivity(query:any={}) {
  const limit=Math.min(Math.max(Number(query.limit)||100,1),200);const filter=buildThreatWhere(query);
  const [rows,recentRows,sources]=await Promise.all([
    queryPBXPulsDb(`SELECT * FROM security_events WHERE ${filter.sql} ORDER BY last_seen_at DESC LIMIT ${limit}`,filter.params),
    queryPBXPulsDb(`SELECT category,result,source_ip,service,occurrence_count,last_seen_at FROM security_events WHERE last_seen_at>=DATE_SUB(NOW(),INTERVAL 5 MINUTE) ORDER BY last_seen_at DESC`),
    listThreatSources().catch(()=>[])
  ]);
  const normalized=rows.map((row:any)=>normalizeThreatRow(row));const recent=recentRows.map((row:any)=>normalizeThreatRow(row));const recentSummary=summarizeRecentThreatRows(recent);const sum=(prefix:string)=>recent.filter((row:any)=>String(row.category).startsWith(prefix)).reduce((n:number,row:any)=>n+Number(row.occurrence_count||1),0);const byIp=new Map<string,number>();const byService=new Map<string,number>();for(const row of recent){if(row.source_ip)byIp.set(row.source_ip,(byIp.get(row.source_ip)||0)+Number(row.occurrence_count||1));if(row.service)byService.set(row.service,(byService.get(row.service)||0)+Number(row.occurrence_count||1));}
  const availableSources=sources.filter((source:any)=>source.available).length;const activeSources=sources.filter((source:any)=>source.available&&dateEpoch(source.last_success_at)>=Date.now()-300000).length;const lastEventAt=normalized[0]?.last_seen_at||null;
  const summary:any={activeSources,availableSources,collectorRunning:activeSources>0,activeThreats:recent.filter((row:any)=>row.activityStatus==='active').length,...recentSummary,blocked5m:recent.filter((row:any)=>row.activityStatus==='blocked').length,sipAttempts5m:sum('sip_'),sshAttempts5m:sum('ssh_'),httpAttempts5m:sum('http_'),firewallAttempts5m:sum('firewall_'),topIp:[...byIp.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null,topService:[...byService.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null,lastEventAt};summary.streamState=getThreatStreamState(summary);
  return{rows:query.groupBy==='ip'?groupThreatsByIp(normalized):normalized,total:normalized.length,sources,summary};
}
