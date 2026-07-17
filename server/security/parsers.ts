import crypto from 'crypto';
import type { SecurityEventInput, SecurityFirewallRule, SecurityListeningPort, SecuritySeverity } from './types.js';
import { isPrivateSecurityIp, maskSecuritySecrets } from './sanitize.js';

const CRITICAL_PORTS: Record<number, { service: string; risk: SecuritySeverity; reason: string }> = {
  22: { service: 'SSH', risk: 'medium', reason: 'Административный SSH слушает wildcard/LAN адрес' },
  3000: { service: 'PBXPuls', risk: 'high', reason: 'PBXPuls слушает не только loopback' },
  3306: { service: 'MariaDB', risk: 'critical', reason: 'MariaDB слушает не только loopback' },
  5038: { service: 'Asterisk AMI', risk: 'critical', reason: 'AMI слушает не только loopback' },
  8088: { service: 'Asterisk HTTP/ARI', risk: 'high', reason: 'Asterisk HTTP слушает не только loopback' },
  8089: { service: 'Asterisk HTTPS/WebSocket', risk: 'medium', reason: 'Asterisk HTTPS/WebSocket слушает не только loopback' },
  5060: { service: 'SIP', risk: 'high', reason: 'SIP слушает wildcard/LAN адрес' },
  5061: { service: 'SIP TLS', risk: 'medium', reason: 'SIP TLS слушает wildcard/LAN адрес' }
};

function splitAddress(value: string): { address: string; port: number } | null {
  const text = value.trim();
  const bracket = text.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracket) return { address: bracket[1], port: Number(bracket[2]) };
  const idx = text.lastIndexOf(':');
  if (idx < 0) return null;
  const port = Number(text.slice(idx + 1));
  if (!Number.isInteger(port)) return null;
  return { address: text.slice(0, idx) || '*', port };
}

export function parseSsListeningPorts(output: string): SecurityListeningPort[] {
  const result: SecurityListeningPort[] = [];
  for (const line of String(output || '').split(/\r?\n/).filter(Boolean)) {
    const columns = line.trim().split(/\s+/);
    const protocol = columns[0]?.toLowerCase().startsWith('udp') ? 'udp' : columns[0]?.toLowerCase().startsWith('tcp') ? 'tcp' : null;
    if (!protocol) continue;
    const localIndex = columns.findIndex(value => /(?::\d+)$/.test(value) && !/^\d+$/.test(value));
    if (localIndex < 0) continue;
    const endpoint = splitAddress(columns[localIndex]);
    if (!endpoint) continue;
    const processText = line.match(/users:\(\(.*$/)?.[0] || '';
    const process = processText.match(/\(\("([^"]+)"/)?.[1];
    const pid = Number(processText.match(/pid=(\d+)/)?.[1]) || undefined;
    const local = ['127.0.0.1', '::1'].includes(endpoint.address);
    const wildcard = ['*', '0.0.0.0', '::', '[::]'].includes(endpoint.address);
    const critical = CRITICAL_PORTS[endpoint.port];
    result.push({
      protocol, address: endpoint.address, port: endpoint.port, process, pid,
      service: critical?.service || process,
      exposure: local ? 'local_only' : wildcard ? 'external_possible' : isPrivateSecurityIp(endpoint.address) ? 'lan_only' : 'external_possible',
      risk: local ? 'info' : (critical?.risk || (wildcard ? 'low' : 'info')),
      riskReason: local ? undefined : critical?.reason || (wildcard ? 'Сервис слушает все интерфейсы; итог зависит от Firewall и маршрутизации' : undefined)
    });
  }
  return result.filter((item, index, all) => all.findIndex(other => other.protocol === item.protocol && other.address === item.address && other.port === item.port) === index);
}

function firewallRisk(action: SecurityFirewallRule['action'], source: string, port: string): Pick<SecurityFirewallRule, 'risk' | 'riskReason'> {
  const open = source === '0.0.0.0/0' || source === '::/0' || source === 'anywhere' || source === '0/0';
  const numericPort = Number(String(port || '').split(':')[0]);
  if (action === 'accept' && open && [3306, 5038].includes(numericPort)) return { risk: 'critical', riskReason: 'Критический административный порт разрешён для любого источника' };
  if (action === 'accept' && open && [22, 3000, 5060, 5061, 8088, 8089].includes(numericPort)) return { risk: 'high', riskReason: 'Чувствительный порт разрешён для любого источника' };
  return { risk: action === 'accept' && open ? 'medium' : 'info', riskReason: action === 'accept' && open ? 'Разрешение для любого источника' : undefined };
}

export function parseIptablesRules(output: string, family: 'ipv4' | 'ipv6' = 'ipv4'): SecurityFirewallRule[] {
  const rules: SecurityFirewallRule[] = [];
  let chain = '';
  for (const line of String(output || '').split(/\r?\n/)) {
    const chainMatch = line.match(/^Chain\s+(\S+)\s+\(policy\s+(\S+)/);
    if (chainMatch) { chain = chainMatch[1]; continue; }
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(ACCEPT|DROP|REJECT|LOG)\s+(\S+)\s+\S+\s+\S+\s+\S+\s+(\S+)\s+(\S+)(.*)$/i);
    if (!match) continue;
    const tail = match[7] || '';
    const destinationPort = tail.match(/dpts?:([\d:]+)/)?.[1] || tail.match(/dpt:(\d+)/)?.[1] || '';
    const action = match[3].toLowerCase() as SecurityFirewallRule['action'];
    const risk = firewallRisk(action, match[5], destinationPort);
    rules.push({ id: crypto.createHash('sha1').update(`${family}|${chain}|${line}`).digest('hex').slice(0, 16), family, table: 'filter', chain, action,
      protocol: ['tcp', 'udp', 'icmp', 'all'].includes(match[4]) ? match[4] as any : 'other', source: match[5], destination: match[6],
      destinationPort, packets: Number(match[1]), bytes: Number(match[2]), raw: maskSecuritySecrets(line, 1000), ...risk });
  }
  return rules;
}

export function parseNftablesRules(output: string): SecurityFirewallRule[] {
  const rules: SecurityFirewallRule[] = [];
  let family: SecurityFirewallRule['family'] = 'unknown'; let table = ''; let chain = '';
  for (const line of String(output || '').split(/\r?\n/)) {
    const tableMatch = line.match(/^table\s+(ip6|ip|inet)\s+(\S+)/); if (tableMatch) { family = tableMatch[1] === 'ip' ? 'ipv4' : tableMatch[1] === 'ip6' ? 'ipv6' : 'inet'; table = tableMatch[2]; }
    const chainMatch = line.match(/^\s*chain\s+(\S+)/); if (chainMatch) chain = chainMatch[1];
    if (/\bpolicy\s+(accept|drop)\b/.test(line)) continue;
    const actionMatch = line.match(/\b(accept|drop|reject|log)\b/); if (!actionMatch || !chain) continue;
    const action = actionMatch[1] as SecurityFirewallRule['action'];
    const protocol = line.match(/\b(tcp|udp|icmp)\b/)?.[1] as any || 'all';
    const destinationPort = line.match(/dport\s+([\d-]+)/)?.[1] || '';
    const source = line.match(/saddr\s+(\S+)/)?.[1] || '0.0.0.0/0';
    rules.push({ id: crypto.createHash('sha1').update(`${family}|${table}|${chain}|${line}`).digest('hex').slice(0, 16), family, table, chain, action, protocol, source,
      destinationPort, raw: maskSecuritySecrets(line.trim(), 1000), ...firewallRisk(action, source, destinationPort) });
  }
  return rules;
}

export function parseFail2BanStatus(output: string) {
  const jails = String(output || '').match(/Jail list:\s*(.*)$/m)?.[1]?.split(',').map(value => value.trim()).filter(Boolean) || [];
  return { jails, activeJails: jails.length };
}

export function parseFail2BanJail(output: string, jail: string) {
  const number = (label: string) => Number(String(output || '').match(new RegExp(`${label}:\\s*(\\d+)`, 'i'))?.[1]) || 0;
  const banned = String(output || '').match(/Banned IP list:\s*(.*)$/mi)?.[1]?.trim().split(/\s+/).filter(Boolean) || [];
  return { name: jail, status: 'active', currentlyFailed: number('Currently failed'), totalFailed: number('Total failed'), currentlyBanned: number('Currently banned'), totalBanned: number('Total banned'), bannedIps: banned };
}

export function parseSecurityLogLine(line: string, source: string, occurredAt = new Date().toISOString()): SecurityEventInput | null {
  const text = maskSecuritySecrets(line, 2000); const lower = text.toLowerCase();
  const ip = text.match(/(?<![\d:])(?:\d{1,3}\.){3}\d{1,3}(?![\d:])/g)?.find(Boolean);
  let category = ''; let severity: SecuritySeverity = 'medium'; let title = '';
  if (/failed password|authentication failure|invalid user/.test(lower)) { category = lower.includes('invalid user') ? 'ssh_invalid_user' : 'ssh_auth_failure'; title = 'Неудачная SSH-аутентификация'; severity = 'high'; }
  else if (/securityevent="?challeng|failed to authenticate|no matching endpoint|wrong password/.test(lower)) { category = 'sip_auth_failure'; title = 'Ошибка SIP-аутентификации'; severity = 'high'; }
  else if (/fail2ban.*\bban\b|\bban\s+/.test(lower)) { category = 'fail2ban_ban'; title = 'Fail2Ban заблокировал IP'; severity = 'medium'; }
  else if (/fail2ban.*\bunban\b|\bunban\s+/.test(lower)) { category = 'fail2ban_unban'; title = 'Fail2Ban разблокировал IP'; severity = 'info'; }
  else if (/\.env|wp-login|phpmyadmin|\.git|etc\/passwd|\.\.\//.test(lower)) { category = 'http_sensitive_file_probe'; title = 'Проверка чувствительного HTTP-пути'; severity = 'high'; }
  else return null;
  return { occurredAt, severity, category, source, sourceIp: ip, title, description: text.slice(0, 500), result: category === 'fail2ban_ban' ? 'blocked' : category === 'fail2ban_unban' ? 'success' : 'failed', rawExcerpt: text };
}
