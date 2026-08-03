import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import type { NovofonAuthMode, NovofonProviderConfig } from './providers/novofon.js';

export interface NovofonManagedSettings extends NovofonProviderConfig {
  syncIntervalMinutes: number;
  initialLoadDays: number;
  overlapHours: number;
  packageSettings: { name: string; purchasedMinutes: number; periodStart: string; periodEnd: string; directions: string[] } | null;
}

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const last4 = (value: string) => value ? value.slice(-4) : null;

export class NovofonSettingsStore {
  private readonly key: Buffer;
  constructor(hashSecret: string) { this.key = crypto.createHash('sha256').update(`pbxpuls:balance:novofon:${hashSecret}`).digest(); }

  private encrypt(value: string): string | null {
    if (!value) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
  }

  private decrypt(value: unknown): string {
    const [version, iv, tag, body] = String(value || '').split(':');
    if (version !== 'v1' || !iv || !tag || !body) return '';
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
    } catch { return ''; }
  }

  async load(): Promise<NovofonManagedSettings> {
    const rows = await queryPBXPulsDb(`SELECT s.enabled,s.config_json,s.sync_interval_minutes,
      c.access_token_encrypted,c.login_encrypted,c.password_encrypted,c.api_key_encrypted,c.api_secret_encrypted
      FROM balance_sources s LEFT JOIN balance_source_credentials c ON c.source_id=s.id WHERE s.id='novofon' LIMIT 1`);
    const row = rows[0] || {};
    let config: any = {};
    try { config = JSON.parse(String(row.config_json || '{}')); } catch {}
    return {
      enabled: row.enabled === 1 || row.enabled === true,
      authMode: config.authMode === 'login_password' ? 'login_password' : 'permanent_token',
      permanentToken: this.decrypt(row.access_token_encrypted), login: this.decrypt(row.login_encrypted), password: this.decrypt(row.password_encrypted),
      apiV1Key: this.decrypt(row.api_key_encrypted), apiV1Secret: this.decrypt(row.api_secret_encrypted),
      timeoutMs: clamp(config.timeoutMs, 15_000, 1000, 60_000), syncIntervalMinutes: clamp(row.sync_interval_minutes, 15, 5, 1440),
      initialLoadDays: clamp(config.initialLoadDays, 30, 1, 730), overlapHours: Math.max(24, clamp(config.overlapHours, 24, 24, 168)),
      packageSettings: config.packageSettings && typeof config.packageSettings === 'object' ? config.packageSettings : null
    };
  }

  async save(input: any): Promise<void> {
    const current = await this.load();
    const authMode: NovofonAuthMode = input.authMode === 'login_password' ? 'login_password' : 'permanent_token';
    const packageInput = input.packageSettings;
    const packageSettings = packageInput?.name ? {
      name: String(packageInput.name).slice(0, 191), purchasedMinutes: Math.max(0, Number(packageInput.purchasedMinutes || 0)),
      periodStart: String(packageInput.periodStart || '').slice(0, 10), periodEnd: String(packageInput.periodEnd || '').slice(0, 10),
      directions: Array.isArray(packageInput.directions) ? packageInput.directions.map(String).slice(0, 20) : []
    } : null;
    const config = { managedBy: 'pbxpuls', authMode, timeoutMs: clamp(input.timeoutMs, current.timeoutMs, 1000, 60_000),
      initialLoadDays: clamp(input.initialLoadDays, current.initialLoadDays, 1, 730), overlapHours: Math.max(24, clamp(input.overlapHours, current.overlapHours, 24, 168)), packageSettings };
    await queryPBXPulsDb(`UPDATE balance_sources SET enabled=?,config_json=?,sync_interval_minutes=?,status=IF(?=1,status,'disabled'),updated_at=NOW() WHERE id='novofon'`,
      [input.enabled === true ? 1 : 0, JSON.stringify(config), clamp(input.syncIntervalMinutes, current.syncIntervalMinutes, 5, 1440), input.enabled === true ? 1 : 0]);
    const keep = (key: string, old: string) => Object.prototype.hasOwnProperty.call(input, key) && String(input[key] || '') ? String(input[key]) : old;
    await queryPBXPulsDb(`INSERT INTO balance_source_credentials(source_id,access_token_encrypted,login_encrypted,password_encrypted,api_key_encrypted,api_secret_encrypted,key_version,updated_at)
      VALUES('novofon',?,?,?,?,?,'v1',NOW()) ON DUPLICATE KEY UPDATE access_token_encrypted=VALUES(access_token_encrypted),login_encrypted=VALUES(login_encrypted),
      password_encrypted=VALUES(password_encrypted),api_key_encrypted=VALUES(api_key_encrypted),api_secret_encrypted=VALUES(api_secret_encrypted),key_version='v1',updated_at=NOW()`,
      [this.encrypt(keep('permanentToken', current.permanentToken)), this.encrypt(keep('login', current.login)), this.encrypt(keep('password', current.password)),
        this.encrypt(keep('apiV1Key', current.apiV1Key)), this.encrypt(keep('apiV1Secret', current.apiV1Secret))]);
  }

  safe(settings: NovofonManagedSettings, status: any = {}) {
    return { enabled: settings.enabled, authMode: settings.authMode, timeoutMs: settings.timeoutMs, syncIntervalMinutes: settings.syncIntervalMinutes,
      initialLoadDays: settings.initialLoadDays, overlapHours: settings.overlapHours, packageSettings: settings.packageSettings,
      configured: settings.authMode === 'permanent_token' ? Boolean(settings.permanentToken) : Boolean(settings.login && settings.password),
      permanentTokenLast4: last4(settings.permanentToken), loginLast4: last4(settings.login), apiV1KeyLast4: last4(settings.apiV1Key), apiV1Configured: Boolean(settings.apiV1Key && settings.apiV1Secret),
      lastCheckedAt: status.last_attempt_at || null, connectionStatus: status.status || (settings.enabled ? 'pending' : 'disabled'), safeErrorCode: status.safe_error_code || null };
  }
}
