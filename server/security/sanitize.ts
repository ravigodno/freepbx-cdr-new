import crypto from 'crypto';
import net from 'net';
import type { SecurityEventInput, SecuritySeverity } from './types.js';

const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*(?:bearer|basic)?\s*)[^\s,;]+/gi,
  /((?:password|passwd|pass|secret|token|api[_-]?key|cookie|set-cookie|sipsecret)\s*[:=]\s*)[^\s,;]+/gi,
  /(mysql:\/\/)[^@\s]+@/gi,
  /(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----)/gi
];

export function maskSecuritySecrets(value: unknown, maxLength = 2000): string {
  let text = String(value ?? '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, '$1********');
  return text.slice(0, Math.max(0, Math.min(maxLength, 10000)));
}

export function isValidSecurityIp(value: unknown): boolean {
  const ip = String(value || '').trim();
  return net.isIP(ip) !== 0;
}

export function isLoopbackIp(value: unknown): boolean {
  const ip = String(value || '').trim().toLowerCase();
  return ip === '127.0.0.1' || ip.startsWith('127.') || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function isPrivateSecurityIp(value: unknown): boolean {
  const ip = String(value || '').trim().toLowerCase();
  if (!isValidSecurityIp(ip)) return false;
  if (isLoopbackIp(ip)) return true;
  if (net.isIPv4(ip)) return /^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  return ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:');
}

export function isValidJailName(value: unknown): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(String(value || ''));
}

const SECURITY_PATH_ROOTS = ['/etc/asterisk/', '/etc/fail2ban/', '/etc/ssh/', '/etc/nftables', '/etc/iptables/', '/etc/firewalld/', '/etc/ufw/', '/etc/nginx/', '/etc/httpd/', '/etc/apache2/', '/etc/systemd/system/'];
export function isAllowedSecurityPath(value: unknown): boolean {
  const path = String(value || '').trim();
  return path.startsWith('/') && !path.includes('\0') && !path.split('/').includes('..') && SECURITY_PATH_ROOTS.some(root => path === root.replace(/\/$/,'') || path.startsWith(root));
}

export function securityFingerprint(event: Pick<SecurityEventInput, 'category' | 'source' | 'sourceIp' | 'extension' | 'jail' | 'service' | 'title'>): string {
  const source = [event.category, event.source, event.sourceIp || '', event.extension || '', event.jail || '', event.service || '', event.title]
    .map(value => String(value || '').trim().toLowerCase()).join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}

export function calculateSecurityLevel(items: Array<{ severity?: SecuritySeverity; status?: string }>): SecuritySeverity | 'protected' {
  const active = items.filter(item => !['passed', 'not_applicable'].includes(String(item.status || '')));
  for (const severity of ['critical', 'high', 'medium', 'low'] as SecuritySeverity[]) {
    if (active.some(item => item.severity === severity)) return severity;
  }
  return 'protected';
}
