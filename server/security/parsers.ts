import crypto from 'crypto';
import type { SecurityEventInput, SecurityFirewallRule, SecurityListeningPort, SecuritySeverity } from './types.js';
import { isPrivateSecurityIp, maskSecuritySecrets } from './sanitize.js';

const CRITICAL_PORTS: Record<number, { service: string; risk: SecuritySeverity; reason: string }> = {
  22: { service: 'SSH', risk: 'medium', reason: 'Административный SSH слушает wildcard/LAN адрес' },
  3000: { service: 'PBXPuls', risk: 'medium', reason: 'PBXPuls слушает все интерфейсы; требуется проверка Firewall' },
  3306: { service: 'MariaDB', risk: 'high', reason: 'MariaDB слушает все интерфейсы; требуется проверка Firewall' },
  5038: { service: 'Asterisk AMI', risk: 'high', reason: 'AMI слушает все интерфейсы; требуется проверка Firewall' },
  8088: { service: 'Asterisk HTTP/ARI', risk: 'medium', reason: 'Asterisk HTTP слушает все интерфейсы; требуется проверка Firewall' },
  8089: { service: 'Asterisk HTTPS/WebSocket', risk: 'medium', reason: 'Asterisk HTTPS/WebSocket слушает не только loopback' },
  5060: { service: 'SIP', risk: 'medium', reason: 'SIP слушает все интерфейсы; требуется проверка Firewall' },
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
    const family = endpoint.address.includes(':') ? 'ipv6' : 'ipv4';
    result.push({
      protocol, address: endpoint.address, port: endpoint.port, process, pid, family,
      service: critical?.service || process,
      exposure: local ? 'local_only' : wildcard ? 'external_possible' : isPrivateSecurityIp(endpoint.address) ? 'lan_only' : 'external_possible',
      risk: local ? 'info' : (critical?.risk || (wildcard ? 'low' : 'info')),
      riskReason: local ? undefined : critical?.reason || (wildcard ? 'Сервис слушает все интерфейсы; итог зависит от Firewall и маршрутизации' : undefined)
    });
  }
  return result.filter((item, index, all) => all.findIndex(other => other.protocol === item.protocol && other.address === item.address && other.port === item.port && other.process === item.process && other.pid === item.pid) === index);
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
  let chain = '';let chainPolicy='unknown';
  for (const line of String(output || '').split(/\r?\n/)) {
    const chainMatch = line.match(/^Chain\s+(\S+)\s+\((?:policy\s+(\S+)|\d+\s+references?)/);
    if (chainMatch) { chain = chainMatch[1];chainPolicy=chainMatch[2]?.toUpperCase()||'unknown'; continue; }
    const tokens=line.trim().split(/\s+/); if(!chain||tokens.length<9||tokens[0]==='num'||tokens[0]==='pkts')continue;
    const offset=tokens.length>9&&/^\d+$/.test(tokens[0])&&/^\d+$/.test(tokens[1])&&/^\d+$/.test(tokens[2])?1:0;
    const packets=Number(tokens[offset]),bytes=Number(tokens[offset+1]),target=tokens[offset+2],protocol=tokens[offset+3],interfaceIn=tokens[offset+5],interfaceOut=tokens[offset+6],source=tokens[offset+7],destination=tokens[offset+8];
    if(!Number.isFinite(packets)||!Number.isFinite(bytes)||!target)continue; const tail=tokens.slice(offset+9).join(' ');
    const destinationPort = tail.match(/dpts?:([\d:]+)/)?.[1] || tail.match(/dpt:(\d+)/)?.[1] || '';
    const action = /^(ACCEPT|DROP|REJECT|LOG)$/i.test(target)?target.toLowerCase() as SecurityFirewallRule['action']:'other';
    const risk = firewallRisk(action, source, destinationPort);
    rules.push({ id: crypto.createHash('sha1').update(`${family}|${chain}|${line}`).digest('hex').slice(0, 16), family, table: 'filter', chain, action,
      protocol: ['tcp', 'udp', 'icmp', 'all'].includes(protocol) ? protocol as any : 'other', source, destination, interfaceIn, interfaceOut,
      destinationPort, packets, bytes, chainPolicy,raw: maskSecuritySecrets(line, 1000), sourceMechanism:/^fpbx/i.test(chain)?'freepbx':'iptables', ...risk });
  }
  return rules;
}

export function parseIptablesPolicies(output:string):Record<string,string>{const policies:Record<string,string>={};for(const line of String(output||'').split(/\r?\n/)){const match=line.match(/^-P\s+(\S+)\s+(\S+)/);if(match)policies[match[1].toLowerCase()]=match[2].toUpperCase();}return policies;}

export function parseIptablesSpecRules(output:string,table='filter',family:'ipv4'|'ipv6'='ipv4',sourceMechanism:'iptables'|'firewalld'='iptables'):SecurityFirewallRule[]{const rules:SecurityFirewallRule[]=[];for(const line of String(output||'').split(/\r?\n/)){const match=line.match(/^-A\s+(\S+)\s+(.*)$/);if(!match)continue;const args=match[2],pick=(flag:string)=>args.match(new RegExp(`(?:^|\\s)${flag}\\s+(\\S+)`))?.[1]||'';const target=pick('-j'),action=/^(ACCEPT|DROP|REJECT|LOG)$/i.test(target)?target.toLowerCase() as SecurityFirewallRule['action']:'other';const protocol=pick('-p')||'all',source=pick('-s')|| (family==='ipv6'?'::/0':'0.0.0.0/0'),destination=pick('-d')|| (family==='ipv6'?'::/0':'0.0.0.0/0'),destinationPort=pick('--dport')||pick('--dports');rules.push({id:crypto.createHash('sha1').update(`${sourceMechanism}|${family}|${table}|${line}`).digest('hex').slice(0,16),family,table,chain:match[1],action,protocol:['tcp','udp','icmp','all'].includes(protocol)?protocol as any:'other',source,destination,destinationPort,interfaceIn:pick('-i'),interfaceOut:pick('-o'),raw:maskSecuritySecrets(line,1000),sourceMechanism,...firewallRisk(action,source,destinationPort)});}return rules;}

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
      destinationPort, raw: maskSecuritySecrets(line.trim(), 1000), sourceMechanism:'nftables', ...firewallRisk(action, source, destinationPort) });
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
  if (/securityevent="?(challengesent|successfulauth)|\bchallengesent\b|\bsuccessfulauth\b/.test(lower)) return null;
  const ip = text.match(/(?<![\d:])(?:\d{1,3}\.){3}\d{1,3}(?![\d:])/g)?.find(Boolean);
  const sourcePort=Number(text.match(/(?:sourceport|spt)[=: ]+"?(\d+)/i)?.[1])||undefined,destinationPort=Number(text.match(/(?:destinationport|dpt)[=: ]+"?(\d+)/i)?.[1])||undefined;
  const extension=text.match(/(?:accountid|username|extension|user)[=: ]+"?([A-Za-z0-9_.-]{1,64})/i)?.[1];
  let category = ''; let severity: SecuritySeverity = 'medium'; let title = '';
  if (/failed password|authentication failure|invalid user/.test(lower)) { category = lower.includes('invalid user') ? 'ssh_invalid_user' : 'ssh_auth_failure'; title = 'Неудачная SSH-аутентификация'; severity = 'high'; }
  else if (/securityevent="?challengeresponsefailed|securityevent="?(?:invalidaccountid|failedacl|requestnotallowed)|failed to authenticate|wrong password/.test(lower)) { category = 'sip_auth_failure'; title = 'Ошибка SIP-аутентификации'; severity = 'high'; }
  else if (/manager.*failed.*auth|ami.*failed.*auth|failed to authenticate.*manager/.test(lower)){category='ami_auth_failure';title='Неудачная AMI-аутентификация';severity='high';}
  else if (/\boptions\b.*(?:no matching endpoint|failed|unknown)/.test(lower)){category='sip_options_scan';title='SIP OPTIONS-сканирование';severity='medium';}
  else if (/no matching endpoint|unknown endpoint/.test(lower)){category='sip_scan';title='Попытка через неизвестный SIP endpoint';severity='medium';}
  else if (/extension.*(?:not found|does not exist|unknown)|invalid extension/.test(lower)){category='sip_unknown_extension';title='Подбор внутреннего номера';severity='medium';}
  else if (/fail2ban.*\bban\b|\bban\s+/.test(lower)) { category = 'fail2ban_ban'; title = 'Fail2Ban заблокировал IP'; severity = 'medium'; }
  else if (/fail2ban.*\bunban\b|\bunban\s+/.test(lower)) { category = 'fail2ban_unban'; title = 'Fail2Ban разблокировал IP'; severity = 'info'; }
  else if (/union(?:%20|\s)+select|select(?:%20|\s)+.*from|or(?:%20|\s)+1=1/.test(lower)){category='http_sql_injection';title='Попытка SQL-инъекции';severity='high';}
  else if (/\.\.\/|%2e%2e|etc\/passwd/.test(lower)){category='http_path_traversal';title='Попытка обхода каталогов';severity='high';}
  else if (/\.env|wp-login|wp-admin|phpmyadmin|\.git/.test(lower)) { category = 'http_sensitive_file_probe'; title = 'Проверка чувствительного HTTP-пути'; severity = 'high'; }
  else if (/\b(drop|reject)\b.*\b(src|spt|dpt)=/i.test(text)){category='firewall_drop';title='Соединение отклонено Firewall';severity='medium';}
  else return null;
  const service=category.startsWith('sip_')?'Asterisk SIP':category.startsWith('ami_')?'Asterisk AMI':category.startsWith('ssh_')?'SSH':category.startsWith('http_')?'Web':category.startsWith('firewall_')?'Firewall':category.startsWith('fail2ban_')?'Fail2Ban':undefined;
  return { occurredAt, severity, category, source, sourceIp: ip, sourcePort,destinationPort,protocol:/\budp\b/i.test(text)?'udp':/\btcp\b/i.test(text)?'tcp':undefined,extension:category.startsWith('sip_')?extension:undefined,username:category.startsWith('ssh_')||category.startsWith('ami_')?extension:undefined,service,title, description: text.slice(0, 500), result: ['fail2ban_ban','firewall_drop'].includes(category) ? 'blocked' : category === 'fail2ban_unban' ? 'success' : 'failed', rawExcerpt: text };
}

const sqlLocalTimestamp=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
export function parseSecurityLogTimestamp(line:string,now=new Date()):string|null{const iso=line.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/)||line.match(/^\[(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);if(iso)return`${iso[1]} ${iso[2]}`;const syslog=line.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})/);if(syslog){const date=new Date(`${syslog[1]} ${syslog[2]} ${now.getFullYear()} ${syslog[3]}`);if(date.getTime()>now.getTime()+86400000)date.setFullYear(date.getFullYear()-1);return Number.isNaN(date.getTime())?null:sqlLocalTimestamp(date);}return null;}
