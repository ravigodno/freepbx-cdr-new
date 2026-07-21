import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { getPBXPulsSettingsByCategory, upsertPBXPulsSetting } from '../pbxpulsSettings.js';
import { isPrivateSecurityIp, maskSecuritySecrets, securityFingerprint } from './sanitize.js';
import type { SecurityCheckResult, SecurityEventInput } from './types.js';

export const SECURITY_DEFAULT_SETTINGS: Record<string, boolean | number> = {
  'security.enabled': true, 'security.event_retention_days': 30, 'security.raw_excerpt_enabled': true,
  'security.raw_excerpt_max_length': 2000, 'security.scan_interval_seconds': 60, 'security.log_poll_interval_seconds': 15,
  'security.file_integrity_enabled': false, 'security.file_integrity_interval_minutes': 60,
  'security.geoip_enabled': true, 'security.sip_new_ip_detection_enabled': true,
  'security.notification_cooldown_minutes': 30, 'security.fail2ban_actions_enabled': false
};

export function toSecuritySqlDate(value: unknown): string | null {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

export async function getSecuritySettings() {
  const stored = await getPBXPulsSettingsByCategory('security');
  return { ...SECURITY_DEFAULT_SETTINGS, ...stored, 'security.fail2ban_actions_enabled': stored['security.fail2ban_actions_enabled'] === true };
}

export async function updateSecuritySettings(input: Record<string, unknown>) {
  const allowed = new Set(Object.keys(SECURITY_DEFAULT_SETTINGS));
  const saved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!allowed.has(key)) continue;
    if (key === 'security.fail2ban_actions_enabled' && input.confirmFail2banActions !== true) continue;
    const original = SECURITY_DEFAULT_SETTINGS[key];
    const ranges:Record<string,[number,number]>={'security.event_retention_days':[1,3650],'security.raw_excerpt_max_length':[100,10000],'security.scan_interval_seconds':[30,86400],'security.log_poll_interval_seconds':[5,3600],'security.file_integrity_interval_minutes':[5,10080],'security.notification_cooldown_minutes':[1,10080]};
    const range=ranges[key]||[1,86400];const normalized = typeof original === 'boolean' ? value === true : Math.max(range[0], Math.min(Number(value) || Number(original), range[1]));
    await upsertPBXPulsSetting(key, normalized, { category: 'security', valueType: typeof original === 'boolean' ? 'boolean' : 'number' });
    saved[key] = normalized;
  }
  return saved;
}

export async function upsertSecurityEvent(event: SecurityEventInput):Promise<'created'|'updated'> {
  const settings = await getSecuritySettings();
  const rawEnabled = settings['security.raw_excerpt_enabled'] === true;
  const rawMax = Number(settings['security.raw_excerpt_max_length'] || 2000);
  const fingerprint = securityFingerprint(event);
  const raw = rawEnabled ? maskSecuritySecrets(event.rawExcerpt || '', rawMax) : null;
  const result:any=await queryPBXPulsDb(`INSERT INTO security_events
    (occurred_at, received_at, severity, category, source, source_file, source_ip, source_port, destination_ip, destination_port,
     protocol, extension, username, jail, service, action, result, title, description, fingerprint, occurrence_count,
     first_seen_at, last_seen_at, is_private_ip, raw_excerpt, metadata_json)
    VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE occurrence_count=occurrence_count+1, last_seen_at=VALUES(last_seen_at),
      severity=VALUES(severity), description=VALUES(description), raw_excerpt=VALUES(raw_excerpt), metadata_json=VALUES(metadata_json)`, [
    toSecuritySqlDate(event.occurredAt), event.severity, event.category, event.source, event.sourceFile || null, event.sourceIp || null,
    event.sourcePort || null, event.destinationIp || null, event.destinationPort || null, event.protocol || null,
    event.extension || null, event.username || null, event.jail || null, event.service || null, event.action || null,
    event.result || 'unknown', event.title.slice(0, 255), event.description.slice(0, 2000), fingerprint,
    toSecuritySqlDate(event.occurredAt), toSecuritySqlDate(event.occurredAt), event.sourceIp ? (isPrivateSecurityIp(event.sourceIp) ? 1 : 0) : 0,
    raw, event.metadata ? maskSecuritySecrets(JSON.stringify(event.metadata), 8000) : null
  ]);return Number(result?.affectedRows)===1?'created':'updated';
}

export async function listSecurityEvents(query: Record<string, unknown>) {
  const limit = Math.max(1, Math.min(Number(query.limit) || 50, 200));
  const offset = Math.max(0, Math.min(Number(query.offset) || 0, 1_000_000));
  const where: string[] = []; const params: unknown[] = [];
  for (const [field, column] of [['severity','severity'],['category','category'],['source','source'],['result','result'],['sourceIp','source_ip'],['extension','extension']] as const) {
    const value = String(query[field] || '').trim(); if (value) { where.push(`${column} = ?`); params.push(value); }
  }
  const search = String(query.search || '').trim(); if (search) { where.push('(title LIKE ? OR description LIKE ? OR source_ip LIKE ?)'); params.push(`%${search.slice(0,100)}%`, `%${search.slice(0,100)}%`, `%${search.slice(0,100)}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRows = await queryPBXPulsDb(`SELECT COUNT(*) AS total FROM security_events ${clause}`, params as any[]);
  const rows = await queryPBXPulsDb(`SELECT * FROM security_events ${clause} ORDER BY last_seen_at DESC LIMIT ${limit} OFFSET ${offset}`, params as any[]);
  return { rows, total: Number(countRows[0]?.total || 0), limit, offset };
}

export async function getSecurityEvent(id: number) {
  const rows = await queryPBXPulsDb('SELECT * FROM security_events WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function saveSecurityChecks(checks: SecurityCheckResult[]) {
  for (const check of checks) await queryPBXPulsDb(`INSERT INTO security_check_results
    (check_key, check_group, title, status, severity, summary, details, recommendation, evidence_json, checked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE check_group=VALUES(check_group), title=VALUES(title), status=VALUES(status), severity=VALUES(severity),
      summary=VALUES(summary), details=VALUES(details), recommendation=VALUES(recommendation), evidence_json=VALUES(evidence_json), checked_at=VALUES(checked_at)`,
    [check.id, check.group, check.title, check.status, check.severity, check.summary, check.details || null, check.recommendation || null,
      check.evidence ? maskSecuritySecrets(JSON.stringify(check.evidence), 8000) : null, toSecuritySqlDate(check.checkedAt)]);
}

export async function listWhitelist() { return queryPBXPulsDb('SELECT id, ip_address, comment, created_by, created_at FROM security_ip_whitelist ORDER BY created_at DESC'); }
export async function addWhitelist(ip: string, comment: string, actor: string) {
  await queryPBXPulsDb('INSERT INTO security_ip_whitelist (ip_address, comment, created_by) VALUES (?, ?, ?)', [ip, comment.slice(0, 255), actor.slice(0, 191)]);
  return listWhitelist();
}
export async function deleteWhitelist(id: number) { return queryPBXPulsDb('DELETE FROM security_ip_whitelist WHERE id = ?', [id]); }

export async function cleanupSecurityRetention() {
  const settings = await getSecuritySettings(); const days = Math.max(1, Math.min(Number(settings['security.event_retention_days'] || 30), 3650));
  await queryPBXPulsDb(`DELETE FROM security_events WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ${days} DAY) LIMIT 5000`);
  await queryPBXPulsDb(`DELETE FROM security_alert_history WHERE triggered_at < DATE_SUB(NOW(), INTERVAL ${days} DAY) LIMIT 5000`);
}
