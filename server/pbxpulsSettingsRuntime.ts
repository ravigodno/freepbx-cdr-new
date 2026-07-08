import fs from 'fs';
import path from 'path';
import { getPBXPulsSetting, parseSettingValue } from './pbxpulsSettings.js';
import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { buildLegacySettingsSeedRows, type LegacySettingSeedRow } from './pbxpulsLegacySettings.js';

export type SettingsStorageMode = 'legacy' | 'hybrid' | 'sql';
export type SettingsRuntimeSource = 'legacy' | 'hybrid';

export interface SettingsRuntimeMetadata {
  mode: SettingsStorageMode;
  source: SettingsRuntimeSource;
  effectiveSource: SettingsRuntimeSource;
  requestedMode?: SettingsStorageMode;
  fallbackReason?: string;
  legacyUsed: boolean;
  sqlUsed: boolean;
  secretsSource: 'legacy';
  sqlOverlayCount: number;
  settingsKeys: number;
  secretKeysProtected: number;
}

export interface SettingsRuntimeSnapshot {
  settings: Record<string, unknown>;
  metadata: SettingsRuntimeMetadata;
}

interface SqlRuntimeSettingRow {
  setting_key: string;
  setting_value: string | null;
  value_type: string;
}

const SETTINGS_STORAGE_MODE_KEY = 'settings.storage_mode';
const SETTINGS_API_RUNTIME_SWITCH_KEY = 'settings.api_runtime_switch';
const SECRET_RUNTIME_FALLBACK_REASON = 'sql_settings_runtime_requires_secret_migration';

export async function getSettingsStorageMode(): Promise<SettingsStorageMode> {
  try {
    const value = await getPBXPulsSetting<string>(SETTINGS_STORAGE_MODE_KEY, 'legacy');
    return normalizeSettingsStorageMode(value);
  } catch (error: any) {
    console.warn('[PBXPULS_SETTINGS_RUNTIME] storage mode fallback:', sanitizePBXPulsDbError(error));
    return 'legacy';
  }
}

export async function isSettingsApiRuntimeSwitchEnabled(): Promise<boolean> {
  try {
    const value = await getPBXPulsSetting<boolean>(SETTINGS_API_RUNTIME_SWITCH_KEY, false);
    return value === true;
  } catch (error: any) {
    console.warn('[PBXPULS_SETTINGS_RUNTIME] API switch fallback:', sanitizePBXPulsDbError(error));
    return false;
  }
}

export async function getLegacySettingsSnapshot(): Promise<SettingsRuntimeSnapshot> {
  const legacyDb = readLegacyDbJson();
  const rows = buildLegacySettingsSeedRows(legacyDb);
  const settings = clonePlainObject(legacyDb?.settings);

  return {
    settings,
    metadata: {
      mode: 'legacy',
      source: 'legacy',
      effectiveSource: 'legacy',
      legacyUsed: true,
      sqlUsed: false,
      secretsSource: 'legacy',
      sqlOverlayCount: 0,
      settingsKeys: rows.length,
      secretKeysProtected: countSecretRows(rows)
    }
  };
}

export async function getSqlSettingsSnapshot(): Promise<SettingsRuntimeSnapshot> {
  const legacyDb = readLegacyDbJson();
  const rows = buildLegacySettingsSeedRows(legacyDb);
  const safeRows = getSafeRows(rows);
  const safeSettingsRows = getSafeRuntimeSettingsRows(rows);
  const sqlRows = await readSqlRuntimeSettings(safeRows.map((row) => row.setting_key));
  const settings: Record<string, unknown> = {};
  for (const row of safeSettingsRows) {
    const sqlRow = sqlRows.get(row.setting_key);
    if (!sqlRow || sqlRow.value_type !== row.value_type) continue;
    setNestedSettingValue(settings, stripSettingsPrefix(row.setting_key), parseSettingValue(sqlRow.setting_value, sqlRow.value_type, undefined));
  }

  const sqlOverlayCount = Array.from(sqlRows.keys())
    .filter((key) => safeRows.some((row) => row.setting_key === key))
    .length;

  return {
    settings,
    metadata: {
      mode: 'sql',
      source: 'hybrid',
      effectiveSource: 'hybrid',
      requestedMode: 'sql',
      fallbackReason: SECRET_RUNTIME_FALLBACK_REASON,
      legacyUsed: false,
      sqlUsed: sqlOverlayCount > 0,
      secretsSource: 'legacy',
      sqlOverlayCount,
      settingsKeys: rows.length,
      secretKeysProtected: countSecretRows(rows)
    }
  };
}

export async function buildHybridSettingsSnapshot(): Promise<SettingsRuntimeSnapshot> {
  const legacySnapshot = await getLegacySettingsSnapshot();
  const sqlSnapshot = await getSqlSettingsSnapshot();
  const settings = clonePlainObject(legacySnapshot.settings);
  mergePlainObjects(settings, sqlSnapshot.settings);

  return {
    settings,
    metadata: {
      mode: 'hybrid',
      source: 'hybrid',
      effectiveSource: 'hybrid',
      legacyUsed: true,
      sqlUsed: sqlSnapshot.metadata.sqlOverlayCount > 0,
      secretsSource: 'legacy',
      sqlOverlayCount: sqlSnapshot.metadata.sqlOverlayCount,
      settingsKeys: legacySnapshot.metadata.settingsKeys,
      secretKeysProtected: legacySnapshot.metadata.secretKeysProtected
    }
  };
}

export async function getPBXPulsRuntimeSettingsSnapshot(): Promise<SettingsRuntimeSnapshot> {
  const mode = await getSettingsStorageMode();

  if (mode === 'legacy') {
    const legacySnapshot = await getLegacySettingsSnapshot();
    return {
      ...legacySnapshot,
      metadata: {
        ...legacySnapshot.metadata,
        mode,
        source: 'legacy',
        effectiveSource: 'legacy'
      }
    };
  }

  const hybridSnapshot = await buildHybridSettingsSnapshot();
  if (mode === 'hybrid') {
    return {
      ...hybridSnapshot,
      metadata: {
        ...hybridSnapshot.metadata,
        mode,
        source: 'hybrid',
        effectiveSource: 'hybrid'
      }
    };
  }

  return {
    ...hybridSnapshot,
    metadata: {
      ...hybridSnapshot.metadata,
      mode,
      source: 'hybrid',
      effectiveSource: 'hybrid',
      requestedMode: 'sql',
      fallbackReason: SECRET_RUNTIME_FALLBACK_REASON
    }
  };
}

function normalizeSettingsStorageMode(value: unknown): SettingsStorageMode {
  const mode = String(value ?? '').trim().toLowerCase();
  return mode === 'legacy' || mode === 'hybrid' || mode === 'sql' ? mode : 'legacy';
}

function readLegacyDbJson(): Record<string, any> {
  const dbFile = path.join(process.cwd(), 'data', 'db.json');
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function getSafeRows(rows: LegacySettingSeedRow[]): LegacySettingSeedRow[] {
  return rows.filter((row) => row.willSeed === true && row.is_secret !== true && row.value_type !== 'secret');
}

function getSafeRuntimeSettingsRows(rows: LegacySettingSeedRow[]): LegacySettingSeedRow[] {
  return rows.filter((row) => {
    return row.willSeed === true
      && row.is_secret !== true
      && row.value_type !== 'secret'
      && row.setting_key.startsWith('settings.')
      && row.setting_key !== SETTINGS_STORAGE_MODE_KEY;
  });
}

async function readSqlRuntimeSettings(settingKeys: string[]): Promise<Map<string, SqlRuntimeSettingRow>> {
  const result = new Map<string, SqlRuntimeSettingRow>();
  if (!settingKeys.length) return result;

  try {
    const placeholders = settingKeys.map(() => '?').join(', ');
    const rows = await queryPBXPulsDb(
      `SELECT setting_key, setting_value, value_type FROM settings WHERE is_secret = 0 AND setting_key IN (${placeholders})`,
      settingKeys
    );

    for (const row of rows as any[]) {
      const settingKey = String(row.setting_key || '');
      if (!settingKey) continue;
      result.set(settingKey, {
        setting_key: settingKey,
        setting_value: row.setting_value === null || row.setting_value === undefined ? null : String(row.setting_value),
        value_type: String(row.value_type || '')
      });
    }
  } catch (error: any) {
    console.warn('[PBXPULS_SETTINGS_RUNTIME] SQL snapshot fallback:', sanitizePBXPulsDbError(error));
  }

  return result;
}

function stripSettingsPrefix(settingKey: string): string {
  return settingKey.replace(/^settings\./, '');
}

function setNestedSettingValue(target: Record<string, unknown>, pathKey: string, value: unknown): void {
  const parts = pathKey.split('.').filter(Boolean);
  if (!parts.length) return;

  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const current = cursor[part];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function mergePlainObjects(target: Record<string, unknown>, overlay: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overlay)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = target[key];
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        target[key] = {};
      }
      mergePlainObjects(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

function clonePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

function countSecretRows(rows: LegacySettingSeedRow[]): number {
  return rows.filter((row) => row.is_secret === true || row.value_type === 'secret').length;
}
