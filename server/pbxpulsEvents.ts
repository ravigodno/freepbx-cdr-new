import { isPBXPulsDbAvailable, queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';

export type PBXPulsSystemEventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface WritePBXPulsAuditLogOptions {
  actor_user_id?: number | null;
  actor_label?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface WritePBXPulsSystemEventOptions {
  event_type: string;
  severity?: PBXPulsSystemEventSeverity | string | null;
  source?: string | null;
  message: string;
  details?: unknown;
}

const SENSITIVE_DETAIL_KEYS = new Set([
  'password',
  'pass',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization'
]);

export async function writePBXPulsAuditLog(options: WritePBXPulsAuditLogOptions): Promise<boolean> {
  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    await queryPBXPulsDb(
      `INSERT INTO audit_log
        (actor_user_id, actor_label, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeNullableNumber(options.actor_user_id),
        normalizeNullableText(options.actor_label, 191),
        normalizeRequiredText(options.action, 'unknown', 191),
        normalizeNullableText(options.entity_type, 100),
        normalizeNullableText(options.entity_id, 100),
        serializeEventDetails(options.details),
        normalizeNullableText(options.ip_address, 64),
        normalizeNullableText(options.user_agent, 255)
      ]
    );

    return true;
  } catch (error: any) {
    console.warn('[PBXPULS_EVENTS] audit_log write skipped:', sanitizePBXPulsDbError(error));
    return false;
  }
}

export async function writePBXPulsSystemEvent(options: WritePBXPulsSystemEventOptions): Promise<boolean> {
  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    await queryPBXPulsDb(
      `INSERT INTO system_events
        (event_type, severity, source, message, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        normalizeRequiredText(options.event_type, 'unknown', 100),
        normalizeSeverity(options.severity),
        normalizeNullableText(options.source, 100),
        normalizeRequiredText(options.message, 'PBXPuls system event', 255),
        serializeEventDetails(options.details)
      ]
    );

    return true;
  } catch (error: any) {
    console.warn('[PBXPULS_EVENTS] system_events write skipped:', sanitizePBXPulsDbError(error));
    return false;
  }
}

export function serializeEventDetails(details: unknown): string | null {
  if (details === undefined || details === null) return null;
  if (typeof details === 'string') return sanitizeSensitiveText(details);

  try {
    return JSON.stringify(sanitizeDetailsValue(details));
  } catch (error: any) {
    console.warn('[PBXPULS_EVENTS] details serialization failed:', sanitizePBXPulsDbError(error));
    return null;
  }
}

function sanitizeDetailsValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeDetailsValue(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        result[key] = '********';
      } else {
        result[key] = sanitizeDetailsValue(item);
      }
    }
    return result;
  }

  if (typeof value === 'string') {
    return sanitizeSensitiveText(value);
  }

  return value;
}

function sanitizeSensitiveText(value: string): string {
  return String(value)
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s\r\n;,)]+/gi, '$1********')
    .replace(/((?:password|pass|token|secret|apiKey|api_key|authorization)\s*[:=]\s*)[^\s\r\n;,)]+/gi, '$1********');
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_DETAIL_KEYS.has(String(key || '').replace(/[-_\s]/g, '').toLowerCase())
    || SENSITIVE_DETAIL_KEYS.has(String(key || '').toLowerCase());
}

function normalizeSeverity(severity: WritePBXPulsSystemEventOptions['severity']): PBXPulsSystemEventSeverity {
  const value = String(severity || '').trim().toLowerCase();
  if (value === 'debug' || value === 'info' || value === 'warning' || value === 'error' || value === 'critical') {
    return value;
  }
  return 'warning';
}

function normalizeRequiredText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim() || fallback;
  return text.slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}
