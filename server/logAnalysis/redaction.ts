import crypto from 'crypto';
import { maskSecuritySecrets } from '../security/sanitize.js';

const ANSI = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const EXTRA_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1***'],
  [/(authorization\s*:\s*basic\s+)[^\s,;]+/gi, '$1***'],
  [/(cookie|set-cookie|session(?:id)?|jwt)\s*[:=]\s*[^\s,;]+/gi, '$1=***'],
  [/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1***@'],
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----)[\s\S]*/gi, '$1\n***']
];

export function sanitizeLogText(value: unknown, maxLength = 4000): string {
  let text = Buffer.from(String(value ?? ''), 'utf8').toString('utf8').replace(ANSI, '').replace(/\0/g, '');
  text = maskSecuritySecrets(text, Math.min(10000, Math.max(100, maxLength * 2)));
  for (const [pattern, replacement] of EXTRA_SECRET_PATTERNS) text = text.replace(pattern, replacement);
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, maxLength);
}

export function normalizeFingerprintMessage(value: string): string {
  return sanitizeLogText(value, 2000).toLowerCase()
    .replace(/^\s*(?:\[?\d{4}-\d\d-\d\d[^\]]*\]?|[a-z]{3}\s+\d+\s+\d\d:\d\d:\d\d)\s*/i, '')
    .replace(/\bpid[=: ]*\d+\b/gi, 'pid=*').replace(/\[\d+\]/g, '[*]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, 'uuid=*')
    .replace(/\b(?:uniqueid|linkedid)[=: ]*[\w.-]+/gi, '$1=*')
    .replace(/:\d{4,5}\b/g, ':port').replace(/\battempt\s+\d+\b/gi, 'attempt *')
    .replace(/\s+/g, ' ').trim();
}

export function buildLogFingerprint(parts: unknown[]): string {
  return crypto.createHash('sha256').update(parts.map(value => String(value || '').trim().toLowerCase()).join('|')).digest('hex');
}
