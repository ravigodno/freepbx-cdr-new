import fs from 'fs';
import os from 'os';
import { runSecurityCommand } from './executor.js';
import { parseFail2BanJail, parseFail2BanStatus, parseIptablesRules, parseNftablesRules, parseSecurityLogLine, parseSsListeningPorts } from './parsers.js';
import { calculateSecurityLevel } from './sanitize.js';
import type { SecurityCheckResult, SecurityEventInput, SecurityFirewallRule, SecurityListeningPort, SecuritySeverity } from './types.js';

const LOG_SOURCES = [
  ['/var/log/auth.log','auth'], ['/var/log/secure','auth'], ['/var/log/fail2ban.log','fail2ban'],
  ['/var/log/asterisk/security','asterisk_security'], ['/var/log/asterisk/full','asterisk'],
  ['/var/log/nginx/access.log','nginx'], ['/var/log/nginx/error.log','nginx'],
  ['/var/log/httpd/access_log','apache'], ['/var/log/httpd/error_log','apache'],
  ['/var/log/apache2/access.log','apache'], ['/var/log/apache2/error.log','apache']
] as const;

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
  const mechanisms: string[] = []; let active = false; const rules: SecurityFirewallRule[] = []; const errors: string[] = [];
  const firewalld = await runSecurityCommand('firewall-cmd', ['--state'], 3000);
  if (!firewalld.unavailable) { mechanisms.push('firewalld'); active ||= firewalld.stdout.trim() === 'running'; }
  const nft = await runSecurityCommand('nft', ['list', 'ruleset'], 6000);
  if (!nft.unavailable) { mechanisms.push('nftables'); if (nft.ok && nft.stdout.trim()) { active = true; rules.push(...parseNftablesRules(nft.stdout)); } else if (!nft.ok) errors.push(nft.stderr); }
  const iptables = await runSecurityCommand('iptables', ['-L', '-n', '-v'], 6000);
  if (!iptables.unavailable) { mechanisms.push('iptables'); if (iptables.ok && iptables.stdout.trim()) { active = true; rules.push(...parseIptablesRules(iptables.stdout)); } else if (!iptables.ok) errors.push(iptables.stderr); }
  const ufw = await runSecurityCommand('ufw', ['status', 'verbose'], 4000);
  if (!ufw.unavailable) { mechanisms.push('ufw'); active ||= /status:\s*active/i.test(ufw.stdout); }
  let freepbxFirewall = false;
  try { freepbxFirewall = fs.existsSync('/etc/firewall') || fs.existsSync('/var/www/html/admin/modules/firewall'); } catch {}
  if (freepbxFirewall) mechanisms.unshift('FreePBX Firewall');
  return { detected: mechanisms.length > 0, mechanisms, mechanism: mechanisms.length > 1 ? 'multiple' : mechanisms[0] || 'not_detected', active: mechanisms.length ? active : null,
    status: mechanisms.length ? (active ? 'active' : 'inactive') : 'not_available', rules, ruleCount: rules.length,
    acceptCount: rules.filter(rule => rule.action === 'accept').length, denyCount: rules.filter(rule => ['drop','reject'].includes(rule.action)).length,
    policies: { input: findPolicy(iptables.stdout, 'INPUT'), output: findPolicy(iptables.stdout, 'OUTPUT'), forward: findPolicy(iptables.stdout, 'FORWARD') },
    checkedAt: new Date().toISOString(), errors: errors.filter(Boolean).map(value => value.slice(0, 300)) };
}

function findPolicy(output: string, chain: string) { return String(output || '').match(new RegExp(`Chain ${chain} \\(policy (\\w+)`, 'i'))?.[1]?.toUpperCase() || 'unknown'; }

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
export async function collectServices() {
  const services = [];
  for (const name of SERVICE_NAMES) {
    const show = await runSecurityCommand('systemctl', ['show', name, '--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,ActiveEnterTimestamp,MemoryCurrent,CPUUsageNSec,NRestarts', '--no-pager'], 3500);
    if (show.unavailable) return { status: 'not_available', services: [], error: 'systemctl недоступен' };
    const fields = Object.fromEntries(show.stdout.split(/\r?\n/).map(line => line.split(/=(.*)/s).slice(0,2)).filter(pair => pair.length === 2));
    if (fields.LoadState === 'not-found') continue;
    services.push({ name, detected: fields.LoadState === 'loaded', active: fields.ActiveState || 'unknown', subState: fields.SubState || 'unknown', enabled: fields.UnitFileState || 'unknown',
      pid: Number(fields.MainPID || 0) || null, startedAt: fields.ActiveEnterTimestamp || null, memoryBytes: Number(fields.MemoryCurrent || 0) || null,
      cpuNs: Number(fields.CPUUsageNSec || 0) || null, restarts: Number(fields.NRestarts || 0) || 0 });
  }
  services.push({ name: 'pbxpuls', detected: true, active: 'active', subState: 'running', enabled: 'pm2', pid: process.pid, startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), memoryBytes: process.memoryUsage().rss, cpuNs: null, restarts: null });
  return { status: 'available', services };
}

export function buildSecurityChecks(input: { firewall: any; fail2ban: any; ports: SecurityListeningPort[]; services: any[] }): SecurityCheckResult[] {
  const now = new Date().toISOString(); const result: SecurityCheckResult[] = [];
  const add = (item: Omit<SecurityCheckResult,'checkedAt'>) => result.push({ ...item, checkedAt: now });
  add({ id:'firewall_active', group:'firewall', title:'Firewall активен', status: input.firewall.active === true ? 'passed' : input.firewall.active === false ? 'failed' : 'unknown', severity: input.firewall.active === false ? 'critical' : 'info', summary: input.firewall.active === true ? `Активен: ${input.firewall.mechanism}` : input.firewall.active === false ? 'Firewall обнаружен, но не активен' : 'Статус Firewall определить не удалось', recommendation:'Проверьте защиту сервера вручную; PBXPuls правила не изменяет.' });
  add({ id:'fail2ban_active', group:'fail2ban', title:'Fail2Ban активен', status: input.fail2ban.status === 'active' ? 'passed' : input.fail2ban.installed === false ? 'failed' : 'unknown', severity: input.fail2ban.status === 'active' ? 'info' : 'high', summary: input.fail2ban.status === 'active' ? `Активных jail: ${input.fail2ban.activeJails}` : 'Fail2Ban неактивен или недоступен', recommendation:'Проверьте службу и jail для Asterisk/SSH.' });
  const jailKnown = Array.isArray(input.fail2ban.jails); const hasAsteriskJail = input.fail2ban.jails?.some((jail:any) => /asterisk|freepbx/i.test(jail.name));
  add({ id:'asterisk_jail', group:'fail2ban', title:'Jail для Asterisk', status: !jailKnown ? 'unknown' : hasAsteriskJail ? 'passed' : 'failed', severity: hasAsteriskJail ? 'info' : 'high', summary: hasAsteriskJail ? 'Jail Asterisk/FreePBX активен' : 'Активный jail Asterisk/FreePBX не найден', recommendation:'Настройте jail вручную после проверки путей логов.' });
  for (const [port, title, severity] of [[3306,'MariaDB на wildcard','critical'],[5038,'AMI на wildcard','critical'],[3000,'PBXPuls на wildcard','high'],[5060,'SIP на wildcard','high']] as const) {
    const socket = input.ports.find(item => item.port === port && item.exposure === 'external_possible');
    add({ id:`port_${port}_wildcard`, group:'ports', title, status: socket ? 'warning' : 'passed', severity: socket ? severity : 'info', summary: socket ? `${socket.protocol.toUpperCase()} ${socket.address}:${port}; внешняя доступность зависит от Firewall и маршрутизации` : 'Wildcard listener не обнаружен', recommendation: socket ? 'Проверьте bind-адрес и разрешающие правила Firewall.' : undefined, evidence: socket ? { address: socket.address, protocol: socket.protocol, exposure: socket.exposure } : undefined });
  }
  const asterisk = input.services.find(item => item.name === 'asterisk');
  add({ id:'asterisk_service', group:'services', title:'Служба Asterisk', status: !asterisk ? 'unknown' : asterisk.active === 'active' ? 'passed' : 'failed', severity: asterisk?.active === 'active' ? 'info' : 'critical', summary: asterisk ? `Состояние: ${asterisk.active}` : 'Служба не обнаружена' });
  return result;
}

export async function collectRecentLogEvents(cursors: Record<string, { lastSize: number; lastMtime?: string }> = {}): Promise<{ events: SecurityEventInput[]; sources: any[] }> {
  const events: SecurityEventInput[] = []; const sources = [];
  for (const [file, source] of LOG_SOURCES) {
    try {
      const stat = await fs.promises.stat(file); const cursor = cursors[`${source}:${file}`];
      if (cursor && cursor.lastSize === stat.size && cursor.lastMtime === stat.mtime.toISOString()) {
        sources.push({ path:file, source, status:'available', size:stat.size, mtime:stat.mtime.toISOString() });
        continue;
      }
      const rotated = !cursor || stat.size < cursor.lastSize;
      const start = rotated ? Math.max(0, stat.size - 128 * 1024) : cursor.lastSize;
      const length = Math.min(Math.max(0, stat.size - start), 128 * 1024); const handle = await fs.promises.open(file, 'r');
      const buffer = Buffer.alloc(length); await handle.read(buffer, 0, length, Math.max(start, stat.size - length)); await handle.close();
      const lines = buffer.toString('utf8').split(/\r?\n/).slice(-1000);
      for (const line of lines) { const event = parseSecurityLogLine(line, source); if (event) { event.sourceFile = file; events.push(event); } }
      sources.push({ path:file, source, status:'available', size:stat.size, mtime:stat.mtime.toISOString() });
    } catch (error:any) { if (error?.code !== 'ENOENT') sources.push({ path:file, source, status:error?.code === 'EACCES' ? 'permission_denied' : 'unknown' }); }
  }
  return { events: events.slice(-2000), sources };
}

export function buildOverview(snapshot: any) {
  const checks = snapshot.checks || []; const issues = checks.filter((check:any) => !['passed','not_applicable'].includes(check.status));
  return { level: calculateSecurityLevel(issues), firewall: snapshot.firewall, fail2ban: snapshot.fail2ban,
    listeningPorts: snapshot.ports?.ports?.length ?? null, criticalPorts: snapshot.ports?.ports?.filter((port:any) => ['critical','high'].includes(port.risk)).length ?? null,
    services: snapshot.services, checks, attention: issues, events24h: snapshot.events24h ?? null, criticalEvents24h: snapshot.criticalEvents24h ?? null,
    lastUpdatedAt: snapshot.generatedAt };
}
