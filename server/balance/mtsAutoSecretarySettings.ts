import crypto from 'node:crypto';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { normalizeMtsAutoSecretaryPhone } from './providers/mtsAutoSecretary.js';

export interface MtsAutoSecretaryProfile {
  id: string;
  branchName: string;
  pbxName: string;
  phone: string;
  apiKey: string;
  active: boolean;
  sortOrder: number;
}

export interface MtsAutoSecretarySettings {
  enabled: boolean;
  timeoutMs: number;
  profiles: MtsAutoSecretaryProfile[];
}

export interface SafeMtsAutoSecretarySettings {
  enabled: boolean;
  timeoutMs: number;
  apiBase: 'https://aa.mts.ru/api/v5';
  profiles: Array<Omit<MtsAutoSecretaryProfile, 'apiKey'> & { apiKeyConfigured: boolean }>;
}

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const profileId = (value: unknown, index: number) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 64) || `branch-${index + 1}`;
};

export class MtsAutoSecretarySettingsStore {
  private readonly key: Buffer;

  constructor(hashSecret: string) {
    this.key = crypto.createHash('sha256').update(`pbxpuls:balance:mts-auto-secretary:${hashSecret}`).digest();
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
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  async load(): Promise<MtsAutoSecretarySettings> {
    const sourceRows = await queryPBXPulsDb(
      `SELECT enabled,config_json FROM balance_sources WHERE id='mts_auto_secretary' LIMIT 1`
    );
    const source = sourceRows[0];
    let config: any = {};
    try { config = JSON.parse(String(source?.config_json || '{}')); } catch {}
    const rows = await queryPBXPulsDb(
      `SELECT profile_id,branch_name,pbx_name,phone,api_key_encrypted,active,sort_order
       FROM mts_auto_secretary_profiles ORDER BY sort_order,branch_name,profile_id`
    );
    return {
      enabled: source?.enabled === 1 || source?.enabled === true,
      timeoutMs: clamp(config.timeoutMs, 15000, 1000, 60000),
      profiles: rows.map(row => ({
        id: String(row.profile_id),
        branchName: String(row.branch_name || ''),
        pbxName: String(row.pbx_name || ''),
        phone: normalizeMtsAutoSecretaryPhone(row.phone),
        apiKey: this.decrypt(row.api_key_encrypted),
        active: row.active === 1 || row.active === true,
        sortOrder: Number(row.sort_order) || 100
      }))
    };
  }

  async save(input: any, current: MtsAutoSecretarySettings): Promise<void> {
    const currentProfiles = new Map(current.profiles.map(profile => [profile.id, profile]));
    const rawProfiles = Array.isArray(input?.profiles) ? input.profiles.slice(0, 20) : [];
    if (!rawProfiles.length) throw new Error('profiles_required');
    const profiles = rawProfiles.map((raw: any, index: number) => {
      const id = profileId(raw?.id, index);
      const phone = normalizeMtsAutoSecretaryPhone(raw?.phone);
      if (!phone) throw new Error('invalid_phone');
      const branchName = String(raw?.branchName || '').trim().slice(0, 120);
      if (!branchName) throw new Error('branch_name_required');
      const apiKey = String(raw?.apiKey || '').trim() || currentProfiles.get(id)?.apiKey || '';
      return {
        id,
        branchName,
        pbxName: String(raw?.pbxName || '').trim().slice(0, 120),
        phone,
        apiKey,
        active: raw?.active === true,
        sortOrder: clamp(raw?.sortOrder, (index + 1) * 10, 0, 10000)
      };
    });
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error('duplicate_profile');
    if (new Set(profiles.map(profile => profile.phone)).size !== profiles.length) throw new Error('duplicate_phone');
    for (const profile of profiles) {
      await queryPBXPulsDb(
        `INSERT INTO mts_auto_secretary_profiles
         (profile_id,branch_name,pbx_name,phone,api_key_encrypted,active,sort_order,updated_at)
         VALUES(?,?,?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE branch_name=VALUES(branch_name),pbx_name=VALUES(pbx_name),
         phone=VALUES(phone),api_key_encrypted=VALUES(api_key_encrypted),active=VALUES(active),
         sort_order=VALUES(sort_order),updated_at=NOW()`,
        [
          profile.id, profile.branchName, profile.pbxName, profile.phone,
          profile.apiKey ? this.encrypt(profile.apiKey) : null,
          profile.active ? 1 : 0, profile.sortOrder
        ]
      );
    }
    const config = {
      managedBy: 'pbxpuls',
      profileMode: true,
      timeoutMs: clamp(input?.timeoutMs, current.timeoutMs, 1000, 60000)
    };
    await queryPBXPulsDb(
      `UPDATE balance_sources SET config_json=?,enabled=?,updated_at=NOW() WHERE id='mts_auto_secretary'`,
      [JSON.stringify(config), input?.enabled === true ? 1 : 0]
    );
  }

  safe(settings: MtsAutoSecretarySettings): SafeMtsAutoSecretarySettings {
    return {
      enabled: settings.enabled,
      timeoutMs: settings.timeoutMs,
      apiBase: 'https://aa.mts.ru/api/v5',
      profiles: settings.profiles.map(({ apiKey, ...profile }) => ({
        ...profile,
        apiKeyConfigured: Boolean(apiKey)
      }))
    };
  }
}
