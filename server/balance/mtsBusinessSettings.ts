import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import type { MtsBusinessLookupType } from './providers/mtsBusiness.js';

export interface MtsBusinessManagedSettings {
  enabled: boolean;
  apiBase: string;
  lookupType: MtsBusinessLookupType;
  msisdn: string;
  accountNo: string;
  timeoutMs: number;
  syncIntervalMinutes: number;
  usageOverlapHours: number;
  consumerKey: string;
  consumerSecret: string;
}

export interface SafeMtsBusinessManagedSettings extends Omit<MtsBusinessManagedSettings, 'consumerKey' | 'consumerSecret'> {
  consumerKeyConfigured: boolean;
  consumerSecretConfigured: boolean;
  source: 'pbxpuls' | 'environment';
}

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

export class MtsBusinessSettingsStore {
  private readonly key: Buffer;

  constructor(hashSecret: string) {
    this.key = crypto.createHash('sha256').update(`pbxpuls:balance:mts:${hashSecret}`).digest();
  }

  private encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
  }

  private decrypt(value: unknown): string {
    const [version, iv, tag, body] = String(value || '').split(':');
    if (version !== 'v1' || !iv || !tag || !body) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  }

  async load(fallback: MtsBusinessManagedSettings): Promise<{ settings: MtsBusinessManagedSettings; source: 'pbxpuls' | 'environment' }> {
    const rows = await queryPBXPulsDb(
      `SELECT s.config_json,c.consumer_key_encrypted,c.consumer_secret_encrypted
       FROM balance_sources s LEFT JOIN balance_source_credentials c ON c.source_id=s.id
       WHERE s.id='mts_business' LIMIT 1`
    );
    const row = rows[0];
    if (!row) return { settings: fallback, source: 'environment' };
    let config: any = {};
    try { config = JSON.parse(String(row.config_json || '{}')); } catch {}
    if (config.managedBy !== 'pbxpuls') return { settings: fallback, source: 'environment' };
    return {
      source: 'pbxpuls',
      settings: {
        enabled: config.enabled === true,
        apiBase: 'https://api.mts.ru',
        lookupType: config.lookupType === 'account' ? 'account' : 'msisdn',
        msisdn: String(config.msisdn || ''),
        accountNo: String(config.accountNo || ''),
        timeoutMs: clamp(config.timeoutMs, 15000, 1000, 60000),
        syncIntervalMinutes: clamp(config.syncIntervalMinutes, 30, 1, 1440),
        usageOverlapHours: clamp(config.usageOverlapHours, 24, 1, 168),
        consumerKey: this.decrypt(row.consumer_key_encrypted),
        consumerSecret: this.decrypt(row.consumer_secret_encrypted)
      }
    };
  }

  async save(input: any, current: MtsBusinessManagedSettings): Promise<void> {
    const lookupType: MtsBusinessLookupType = input.lookupType === 'account' ? 'account' : 'msisdn';
    const config = {
      managedBy: 'pbxpuls',
      enabled: input.enabled === true,
      lookupType,
      msisdn: String(input.msisdn || '').trim().replace(/^\+/, ''),
      accountNo: String(input.accountNo || '').trim(),
      timeoutMs: clamp(input.timeoutMs, current.timeoutMs, 1000, 60000),
      syncIntervalMinutes: clamp(input.syncIntervalMinutes, current.syncIntervalMinutes, 1, 1440),
      usageOverlapHours: clamp(input.usageOverlapHours, current.usageOverlapHours, 1, 168)
    };
    if (config.msisdn && !/^7\d{10}$/.test(config.msisdn)) throw new Error('invalid_msisdn');
    if (lookupType === 'account' && !config.accountNo) throw new Error('invalid_account_number');
    const consumerKey = String(input.consumerKey || '').trim() || current.consumerKey;
    const consumerSecret = String(input.consumerSecret || '').trim() || current.consumerSecret;
    await queryPBXPulsDb(
      `UPDATE balance_sources SET config_json=?,enabled=?,sync_interval_minutes=?,updated_at=NOW() WHERE id='mts_business'`,
      [JSON.stringify(config), config.enabled ? 1 : 0, config.syncIntervalMinutes]
    );
    await queryPBXPulsDb(
      `INSERT INTO balance_source_credentials
       (source_id,consumer_key_encrypted,consumer_secret_encrypted,key_version,updated_at)
       VALUES ('mts_business',?,?, 'v1',NOW())
       ON DUPLICATE KEY UPDATE consumer_key_encrypted=VALUES(consumer_key_encrypted),
       consumer_secret_encrypted=VALUES(consumer_secret_encrypted),key_version='v1',updated_at=NOW()`,
      [consumerKey ? this.encrypt(consumerKey) : null, consumerSecret ? this.encrypt(consumerSecret) : null]
    );
  }

  safe(settings: MtsBusinessManagedSettings, source: 'pbxpuls' | 'environment'): SafeMtsBusinessManagedSettings {
    const { consumerKey, consumerSecret, ...publicSettings } = settings;
    return {
      ...publicSettings,
      consumerKeyConfigured: Boolean(consumerKey),
      consumerSecretConfigured: Boolean(consumerSecret),
      source
    };
  }
}
