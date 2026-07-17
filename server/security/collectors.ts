import fs from 'fs';
import os from 'os';
import path from 'path';
import { runSecurityCommand } from './executor.js';
import { parseFail2BanJail, parseFail2BanStatus, parseIptablesPolicies, parseIptablesRules, parseIptablesSpecRules, parseNftablesRules, parseSecurityLogLine, parseSecurityLogTimestamp, parseSsListeningPorts } from './parsers.js';
import { calculateSecurityLevel } from './sanitize.js';
import { isPrivateSecurityIp } from './sanitize.js';
import type { SecurityCheckResult, SecurityEventInput, SecurityFirewallRule, SecurityListeningPort, SecuritySeverity } from './types.js';

const LOG_SOURCES = [
  ['/var/log/auth.log','auth'], ['/var/log/secure','auth'], ['/var/log/fail2ban.log','fail2ban'],
  ['/var/log/messages','kernel'],
  ['/var/log/asterisk/security','asterisk_security'], ['/var/log/asterisk/full','asterisk'],
  ['/var/log/asterisk/fail2ban','asterisk_security'], ['/var/log/asterisk/freepbx_security.log','freepbx'],
  ['/var/log/nginx/access.log','nginx'], ['/var/log/nginx/error.log','nginx'],
  ['/var/log/httpd/access_log','apache'], ['/var/log/httpd/error_log','apache'],
  ['/var/log/apache2/access.log','apache'], ['/var/log/apache2/error.log','apache']
] as const;
export const canonicalSecurityLogPath=(file:string)=>path.posix.normalize(String(file||'').trim());
export const securityLogSourceKey=(source:string,file:string)=>`${String(source||'').trim()}:${canonicalSecurityLogPath(file)}`;

export async function collectOsDiscovery() {
  let osRelease = ''; try { osRelease = await fs.promises.readFile('/etc/os-release', 'utf8'); } catch {}
  const id = osRelease.match(/^ID=(.*)$/m)?.[1]?.replace(/["']/g, '') || os.platform();
  const version = osRelease.match(/^VERSION_ID=(.*)$/m)?.[1]?.replace(/["']/g, '') || os.release();
  const tools: Record<string, boolean> = {};
  for (const tool of ['ss','nft','iptables','firewall-cmd','ufw','fail2ban-client','systemctl','journalctl']) {
    const result = await runSecurityCommand(tool, tool === 'systemctl' ? ['--version'] : tool === 'journalctl' ? ['--version'] : tool === 'ss' ? ['--version'] : ['--help'], 2000);
    tools[tool] = !result.unavailable;
  }
  return { id, version, platform: os.platform(), kernel: os.release(), hostname: os.hostname(), tools };
}

export async function collectListeningPorts(): Promise<{ status: 'available'|'not_available'|'unknown'; ports: SecurityListeningPort[]; error?: string }> {
  const ss = await runSecurityCommand('ss', ['-H', '-lntup'], 5000);
  if (ss.ok || ss.stdout) return { status: 'available', ports: parseSsListeningPorts(ss.stdout) };
  const netstat = await runSecurityCommand('netstat', ['-lntup'], 5000);
  return netstat.ok ? { status: 'available', ports: parseSsListeningPorts(netstat.stdout) } : { status: ss.unavailable && netstat.unavailable ? 'not_available' : 'unknown', ports: [], error: ss.stderr || netstat.stderr };
}

export async function collectFirewall() {
  const mechanisms: string[] = []; let active = false; const rules: SecurityFirewallRule[] = []; const errors: string[] = []; const policySources:Record<string,any>={};
  const firewalld = await runSecurityCommand('firewall-cmd', ['--state'], 3000);
  if (!firewalld.unavailable) { mechanisms.push('firewalld'); const running=firewalld.stdout.trim()==='running';active ||= running;if(running){const [zones,allZones,direct]=await Promise.all([runSecurityCommand('firewall-cmd',['--get-active-zones'],5000),runSecurityCommand('firewall-cmd',['--list-all-zones'],8000),runSecurityCommand('firewall-cmd',['--direct','--get-all-rules'],5000)]);policySources.firewalld={activeZones:zones.ok?zones.stdout.trim():null,zonesAvailable:allZones.ok,directAvailable:direct.ok};if(direct.ok){const directSpecs=direct.stdout.split(/\r?\n/).map(line=>{const parts=line.trim().split(/\s+/);return parts.length>4?`-A ${parts[2]} ${parts.slice(4).join(' ')}`:'';}).filter(Boolean).join('\n');rules.push(...parseIptablesSpecRules(directSpecs,'direct','ipv4','firewalld'));}} }
  const nft = await runSecurityCommand('nft', ['list', 'ruleset'], 6000);
  if (!nft.unavailable) { mechanisms.push('nftables'); if (nft.ok && nft.stdout.trim()) { active = true; rules.push(...parseNftablesRules(nft.stdout)); } else if (!nft.ok) errors.push(nft.stderr); }
  const iptablesSpec = await runSecurityCommand('iptables', ['-S'], 6000); const iptables = await runSecurityCommand('iptables', ['-L', '-n', '-v', '--line-numbers'], 8000);
  if (!iptables.unavailable) { mechanisms.push('iptables'); if (iptables.ok && iptables.stdout.trim()) { active = true; rules.push(...parseIptablesRules(iptables.stdout)); } else if (!iptables.ok) errors.push(iptables.stderr); const policies=parseIptablesPolicies(iptablesSpec.stdout);policySources.iptables=policies;for(const table of ['nat','mangle']){const tableResult=await runSecurityCommand('iptables',['-t',table,'-S'],6000);if(tableResult.ok)rules.push(...parseIptablesSpecRules(tableResult.stdout,table));} }
  const ip6Spec=await runSecurityCommand('ip6tables',['-S'],6000);const ip6List=await runSecurityCommand('ip6tables',['-L','-n','-v','--line-numbers'],8000);if(!ip6List.unavailable){mechanisms.push('ip6tables');if(ip6List.ok){active ||= Boolean(ip6List.stdout.trim());rules.push(...parseIptablesRules(ip6List.stdout,'ipv6'));}policySources.ip6tables=parseIptablesPolicies(ip6Spec.stdout);for(const table of ['nat','mangle']){const tableResult=await runSecurityCommand('ip6tables',['-t',table,'-S'],6000);if(tableResult.ok)rules.push(...parseIptablesSpecRules(tableResult.stdout,table,'ipv6'));}}
  const ufw = await runSecurityCommand('ufw', ['status', 'verbose'], 4000);
  if (!ufw.unavailable) { mechanisms.push('ufw'); active ||= /status:\s*active/i.test(ufw.stdout); }
  let freepbxFirewall = false;
  try { freepbxFirewall = fs.existsSync('/etc/firewall') || fs.existsSync('/var/www/html/admin/modules/firewall'); } catch {}
  if (freepbxFirewall) mechanisms.unshift('FreePBX Firewall');
  return { detected: mechanisms.length > 0, mechanisms, mechanism: mechanisms.length > 1 ? 'multiple' : mechanisms[0] || 'not_detected', active: mechanisms.length ? active : null,
    status: mechanisms.length ? (active ? 'active' : 'inactive') : 'not_available', rules, ruleCount: rules.length,
    acceptCount: rules.filter(rule => rule.action === 'accept').length, denyCount: rules.filter(rule => ['drop','reject'].includes(rule.action)).length,
    policies: { input: policySources.iptables?.input || findPolicy(iptables.stdout, 'INPUT'), output: policySources.iptables?.output || findPolicy(iptables.stdout, 'OUTPUT'), forward: policySources.iptables?.forward || findPolicy(iptables.stdout, 'FORWARD') }, policySources,
    checkedAt: new Date().toISOString(), errors: errors.filter(Boolean).map(value => value.slice(0, 300)) };
}

function findPolicy(output: string, chain: string) { return String(output || '').match(new RegExp(`Chain ${chain} \\(policy (\\w+)`, 'i'))?.[1]?.toUpperCase() || 'unknown'; }

function ruleMatchesPort(rule:SecurityFirewallRule,port:SecurityListeningPort){const values=String(rule.destinationPort||'').split(/[, ]/);return values.some(value=>Number(value)===port.port||(/^\d+:\d+$/.test(value)&&port.port>=Number(value.split(':')[0])&&port.port<=Number(value.split(':')[1])));}
export function classifyListeningPortExposure(ports:SecurityListeningPort[],firewall:any):SecurityListeningPort[]{return ports.map(port=>{if(port.exposure==='local_only')return port;const wildcard=['*','0.0.0.0','::','[::]'].includes(port.address);if(!wildcard)return port;const candidates=(firewall.rules||[]).filter((rule:SecurityFirewallRule)=>rule.chain==='INPUT'&&rule.action==='accept'&&ruleMatchesPort(rule,port));const open=candidates.some((rule:SecurityFirewallRule)=>['0.0.0.0/0','::/0','0/0','anywhere'].includes(String(rule.source||'').toLowerCase()));const trusted=candidates.length>0&&candidates.every((rule:SecurityFirewallRule)=>isPrivateSecurityIp(String(rule.source||'').split('/')[0]));if(open){return{...port,exposure:'externally_exposed',risk:[3306,5038].includes(port.port)?'critical':'high',riskReason:'Firewall явно разрешает этот порт для внешнего источника'};}if(trusted){return{...port,exposure:'lan_only',risk:'low',riskReason:'Firewall ограничивает доступ локальной сетью или доверенными IP'};}return{...port,exposure:firewall.status==='not_available'?'unknown':'external_possible',risk:[3306,5038].includes(port.port)?'high':['22','3000','5060','5061','8088','8089'].includes(String(port.port))?'medium':port.risk,riskReason:'Слушает на всех интерфейсах — требуется проверка Firewall'};});}

export async function collectFail2Ban() {
  const version = await runSecurityCommand('fail2ban-client', ['--version'], 3000);
  if (version.unavailable) return { installed: false, status: 'not_available', version: null, activeJails: null, currentlyBanned: null, totalBanned: null, jails: [], errors: [] };
  const status = await runSecurityCommand('fail2ban-client', ['status'], 5000);
  if (!status.ok) return { installed: true, status: 'unknown', version: version.stdout.trim() || null, activeJails: null, currentlyBanned: null, totalBanned: null, jails: [], errors: [status.stderr] };
  const parsed = parseFail2BanStatus(status.stdout); const jails = [];
  for (const jail of parsed.jails.slice(0, 100)) {
    const detail = await runSecurityCommand('fail2ban-client', ['status', jail], 5000);
    jails.push(detail.ok ? parseFail2BanJail(detail.stdout, jail) : { name: jail, status: 'unknown', error: detail.stderr });
  }
  return { installed: true, status: 'active', version: version.stdout.trim() || version.stderr.trim() || null, activeJails: jails.length,
    currentlyBanned: jails.reduce((sum: number, jail: any) => sum + Number(jail.currentlyBanned || 0), 0),
    totalBanned: jails.reduce((sum: number, jail: any) => sum + Number(jail.totalBanned || 0), 0), jails, errors: [] };
}

const SERVICE_NAMES = ['asterisk','fail2ban','firewalld','nftables','ufw','sshd','ssh','mariadb','mysql','httpd','apache2','nginx','pm2-root','crond','cron','rsyslog','systemd-journald'];
export function normalizeServiceMetric(value:unknown,physicalMemory=os.totalmem()):number|null{if(value===null||value===undefined||value==='')return null;const number=Number(value);if(!Number.isFinite(number)||number<0||[4294967295,18446744073709551615].includes(number)||number>Math.max(physicalMemory*4,1024**4))return null;return number;}

async function findAsteriskProcess():Promise<{pid:number|null;method:string|null}>{try{for(const entry of await fs.promises.readdir('/proc')){if(!/^\d+$/.test(entry))continue;try{const [comm,cmdline]=await Promise.all([fs.promises.readFile(`/proc/${entry}/comm`,'utf8'),fs.promises.readFile(`/proc/${entry}/cmdline`,'utf8')]);const command=cmdline.replace(/\0/g,' ').trim(),args=command.split(/\s+/).slice(1);if((comm.trim()==='asterisk'||command.split(/\s+/)[0]?.endsWith('/asterisk'))&&!args.some(arg=>arg==='-r'||arg==='-rx'||arg.startsWith('-rx')))return{pid:Number(entry),method:'process'};}catch{}}}catch{}return{pid:null,method:null};}

async function detectAsteriskService(systemd:any,ports:SecurityListeningPort[]){const evidence:any={systemd:{active:systemd?.active||'unknown',subState:systemd?.subState||'unknown',enabled:systemd?.enabled||'unknown'}};const [serviceStatus,fwconsole,cli,processInfo]=await Promise.all([runSecurityCommand('service',['asterisk','status'],5000),runSecurityCommand('fwconsole',['status'],7000),runSecurityCommand('asterisk',['-rx','core show uptime'],5000),findAsteriskProcess()]);evidence.service={ok:serviceStatus.ok};evidence.fwconsole={ok:fwconsole.ok,supported:!fwconsole.unavailable&&!/not defined/i.test(fwconsole.stderr+fwconsole.stdout)};evidence.cli={ok:cli.ok,uptimeReported:/system uptime|last reload/i.test(cli.stdout)};evidence.process={present:Boolean(processInfo.pid),pid:processInfo.pid};let socket=false;try{socket=(await fs.promises.stat('/var/run/asterisk/asterisk.ctl')).isSocket();}catch{}evidence.controlSocket=socket;evidence.listeningSockets=ports.filter(port=>port.process==='asterisk').map(port=>`${port.protocol}:${port.port}`).slice(0,20);const positives=[evidence.cli.uptimeReported,evidence.process.present,socket,evidence.listeningSockets.length>0,systemd?.active==='active'];const negatives=[systemd?.active==='inactive',serviceStatus.ok===false&&serviceStatus.unavailable===false];let active:'active'|'inactive'|'unknown'='unknown',method='conflicting_sources';if(positives.some(Boolean)){active='active';method=evidence.cli.uptimeReported?'asterisk_cli':evidence.process.present?'process':socket?'control_socket':systemd?.active==='active'?'systemd':'listening_socket';}else if(negatives.every(Boolean)&&negatives.length>=2){active='inactive';method='multiple_negative_sources';}return{name:'asterisk',detected:positives.some(Boolean)||systemd?.detected===true,active,subState:active==='active'?'running':active==='inactive'?'stopped':'unknown',enabled:systemd?.enabled==='bad'?'unknown':systemd?.enabled||'unknown',pid:processInfo.pid||systemd?.pid||null,startedAt:systemd?.startedAt||null,memoryBytes:normalizeServiceMetric(systemd?.memoryBytes),cpuPercent:null,restarts:systemd?.restarts??null,detectionMethod:method,evidence};}
export async function collectServices(ports:SecurityListeningPort[] = []) {
  const services = [];
  for (const name of SERVICE_NAMES) {
    const show = await runSecurityCommand('systemctl', ['show', name, '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,ActiveEnterTimestamp,MemoryCurrent,CPUUsageNSec,NRestarts', '--no-pager'], 3500);
    if (show.unavailable) return { status: 'not_available', services: [], error: 'systemctl недоступен' };
    const fields = Object.fromEntries(show.stdout.split(/\r?\n/).map(line => line.split(/=(.*)/s).slice(0,2)).filter(pair => pair.length === 2));
    if (fields.LoadState === 'not-found') continue;
    services.push({ name, detected: fields.LoadState === 'loaded', active: fields.ActiveState || 'unknown', subState: fields.SubState || 'unknown', enabled: fields.UnitFileState === 'bad' ? 'unknown' : fields.UnitFileState || 'unknown',
      pid: normalizeServiceMetric(fields.MainPID,Number.MAX_SAFE_INTEGER), startedAt: fields.ActiveEnterTimestamp || null, memoryBytes: normalizeServiceMetric(fields.MemoryCurrent),
      cpuNs: normalizeServiceMetric(fields.CPUUsageNSec,Number.MAX_SAFE_INTEGER), cpuPercent:null,restarts: normalizeServiceMetric(fields.NRestarts,Number.MAX_SAFE_INTEGER) });
  }
  const systemdAsterisk=services.find((service:any)=>service.name==='asterisk');const asterisk=await detectAsteriskService(systemdAsterisk,ports);const index=services.findIndex((service:any)=>service.name==='asterisk');if(index>=0)services[index]=asterisk;else services.unshift(asterisk);
  services.push({ name: 'pbxpuls', detected: true, active: 'active', subState: 'running', enabled: 'pm2', pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), memoryBytes: process.memoryUsage().rss, cpuNs: null, restarts: null });
  return { status: 'available', services };
}

export function buildSecurityChecks(input: { firewall: any; fail2ban: any; ports: SecurityListeningPort[]; services: any[] }): SecurityCheckResult[] {
  const now = new Date().toISOString(); const result: SecurityCheckResult[] = [];
  const add = (item: Omit<SecurityCheckResult,'checkedAt'>) => result.push({ ...item, checkId:item.checkId||item.id, checkedAt: now });
  add({ id:'firewall_active', group:'firewall', targetTab:'firewall', navigation:{tab:'firewall'}, title:'Firewall активен', status: input.firewall.active === true ? 'passed' : input.firewall.active === false ? 'failed' : 'unknown', severity: input.firewall.active === false ? 'critical' : 'info', summary: input.firewall.active === true ? `Активен: ${input.firewall.mechanism}` : input.firewall.active === false ? 'Firewall обнаружен, но не активен' : 'Статус Firewall определить не удалось', recommendation:'Проверьте защиту сервера вручную; PBXPuls правила не изменяет.' });
  add({ id:'fail2ban_active', group:'fail2ban', targetTab:'fail2ban', navigation:{tab:'fail2ban'}, title:'Fail2Ban активен', status: input.fail2ban.status === 'active' ? 'passed' : input.fail2ban.installed === false ? 'failed' : 'unknown', severity: input.fail2ban.status === 'active' ? 'info' : 'high', summary: input.fail2ban.status === 'active' ? `Активных jail: ${input.fail2ban.activeJails}` : 'Fail2Ban неактивен или недоступен', recommendation:'Проверьте службу и jail для Asterisk/SSH.' });
  const jailKnown = Array.isArray(input.fail2ban.jails); const hasAsteriskJail = input.fail2ban.jails?.some((jail:any) => /asterisk|freepbx/i.test(jail.name));
  add({ id:'asterisk_jail', group:'fail2ban', targetTab:'fail2ban', navigation:{tab:'fail2ban',filters:{jail:'asterisk'}}, title:'Jail для Asterisk', status: !jailKnown ? 'unknown' : hasAsteriskJail ? 'passed' : 'failed', severity: hasAsteriskJail ? 'info' : 'high', summary: hasAsteriskJail ? 'Jail Asterisk/FreePBX активен' : 'Активный jail Asterisk/FreePBX не найден', recommendation:'Настройте jail вручную после проверки путей логов.' });
  for (const [port, title, severity] of [[3306,'MariaDB на wildcard','high'],[5038,'AMI на wildcard','high'],[3000,'PBXPuls на wildcard','medium'],[5060,'SIP на wildcard','medium']] as const) {
    const socket = input.ports.find(item => item.port === port && item.exposure === 'external_possible');
    add({ id:`port_${port}_wildcard`, group:'ports', targetTab:'ports', relatedPorts:[port], navigation:{tab:'ports',filters:{ports:[port]}}, title, status: socket ? 'warning' : 'passed', severity: socket ? severity : 'info', summary: socket ? `Слушает на всех интерфейсах — требуется проверка Firewall (${socket.protocol.toUpperCase()} ${socket.address}:${port})` : 'Wildcard listener не обнаружен', recommendation: socket ? 'Проверьте bind-адрес и разрешающие правила Firewall.' : undefined, evidence: socket ? { port, address: socket.address, protocol: socket.protocol, exposure: socket.exposure } : { port } });
  }
  const asterisk = input.services.find(item => item.name === 'asterisk');
  add({ id:'asterisk_service', group:'services', targetTab:'services', service:'asterisk', navigation:{tab:'services',filters:{service:'asterisk'}}, title:'Служба Asterisk', status: !asterisk||asterisk.active==='unknown' ? 'unknown' : asterisk.active === 'active' ? 'passed' : 'failed', severity: asterisk?.active === 'inactive' ? 'critical' : 'info', summary: asterisk ? `Состояние: ${asterisk.active}; метод: ${asterisk.detectionMethod||'unknown'}` : 'Служба не обнаружена',evidence:asterisk?.evidence });
  return result;
}

export async function collectRecentLogEvents(cursors: Record<string, { lastSize: number; lastMtime?: string; inode?: string }> = {}): Promise<{ events: SecurityEventInput[]; sources: any[] }> {
  const events: SecurityEventInput[] = []; const sources = [];
  for (const [file, source] of LOG_SOURCES) {
    try {
      const canonicalPath=canonicalSecurityLogPath(file);const stat = await fs.promises.stat(canonicalPath); const cursor = cursors[securityLogSourceKey(source,canonicalPath)];const inode=String(stat.ino);
      if (cursor && cursor.lastSize === stat.size && cursor.lastMtime === stat.mtime.toISOString()) {
        sources.push({ path:canonicalPath, source, status:'available', size:stat.size, mtime:stat.mtime.toISOString(),inode,linesRead:0,linesParsed:0,lastEventAt:null });
        continue;
      }
      const rotated = !cursor || stat.size < cursor.lastSize || (cursor.inode&&cursor.inode!==inode); const maxRead=cursor?128*1024:2*1024*1024;
      const start = rotated ? Math.max(0, stat.size - maxRead) : cursor.lastSize;
      const length = Math.min(Math.max(0, stat.size - start), maxRead); const handle = await fs.promises.open(file, 'r');
      const buffer = Buffer.alloc(length); await handle.read(buffer, 0, length, Math.max(start, stat.size - length)); await handle.close();
      const lines = buffer.toString('utf8').split(/\r?\n/).filter(Boolean).slice(cursor?-1000:-10000);const cutoff=Date.now()-24*60*60*1000;let linesParsed=0;let lastEventAt:string|null=null;
      for (const line of lines) { const timestamp=parseSecurityLogTimestamp(line);if(!cursor&&timestamp&&new Date(timestamp.replace(' ','T')).getTime()<cutoff)continue;const event = parseSecurityLogLine(line, source,timestamp||new Date().toISOString()); if (event) { event.sourceFile = canonicalPath; events.push(event);linesParsed+=1;lastEventAt=event.occurredAt; } }
      sources.push({ path:canonicalPath, source, status:'available', size:stat.size, mtime:stat.mtime.toISOString(),inode,linesRead:lines.length,linesParsed,lastEventAt });
    } catch (error:any) { if (error?.code !== 'ENOENT') sources.push({ path:file, source, status:error?.code === 'EACCES' ? 'permission_denied' : 'unknown' }); }
  }
  return { events: events.slice(-2000), sources };
}

export function buildOverview(snapshot: any) {
  const checks = snapshot.checks || []; const issues = checks.filter((check:any) => !['passed','not_applicable'].includes(check.status));const confirmedCritical=Number(snapshot.criticalEvents24h||0)>0||issues.some((check:any)=>check.severity==='critical'&&check.status==='failed');const level=confirmedCritical?'critical':calculateSecurityLevel(issues.filter((check:any)=>check.status!=='unknown'));
  const counters={confirmedThreats:Number(snapshot.criticalEvents24h||0)+issues.filter((check:any)=>check.status==='failed').length,warnings:issues.filter((check:any)=>check.status==='warning').length,unknown:issues.filter((check:any)=>check.status==='unknown').length,informational:checks.filter((check:any)=>check.severity==='info').length};
  return { level, counters, firewall: snapshot.firewall, fail2ban: snapshot.fail2ban,
    listeningPorts: snapshot.ports?.ports?.length ?? null, criticalPorts: snapshot.ports?.ports?.filter((port:any) => ['critical','high'].includes(port.risk)).length ?? null,
    services: snapshot.services, checks, attention: issues, events24h: snapshot.events24h ?? null, criticalEvents24h: snapshot.criticalEvents24h ?? null,
    lastUpdatedAt: snapshot.generatedAt };
}
