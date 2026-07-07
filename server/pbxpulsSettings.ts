import { isPBXPulsDbAvailable, queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';

export type PBXPulsSettingValueType = 'string' | 'number' | 'boolean' | 'json' | 'secret';

export interface PBXPulsSettingOptions {
  valueType?: PBXPulsSettingValueType;
  category?: string | null;
  isSecret?: boolean;
  description?: string | null;
}

interface PBXPulsSettingRow {
  setting_key: string;
  setting_value: string | null;
  value_type: PBXPulsSettingValueType;
}

export async function getPBXPulsSetting<T = unknown>(settingKey: string, fallbackValue?: T): Promise<T | undefined> {
  const key = normalizeSettingKey(settingKey);
  if (!key) return fallbackValue;

  try {
    if (!(await isPBXPulsDbAvailable())) return fallbackValue;

    const rows = await queryPBXPulsDb(
      'SELECT setting_value, value_type FROM settings WHERE setting_key = ? LIMIT 1',
      [key]
    );
    const row = rows[0] as PBXPulsSettingRow | undefined;
    if (!row) return fallbackValue;

    return parseSettingValue(row.setting_value, row.value_type, fallbackValue) as T | undefined;
  } catch (error: any) {
    warnSettingsLayer('get failed', key, error);
    return fallbackValue;
  }
}

export async function getPBXPulsSettingsByCategory(category: string): Promise<Record<string, unknown>> {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return {};

  try {
    if (!(await isPBXPulsDbAvailable())) return {};

    const rows = await queryPBXPulsDb(
      'SELECT setting_key, setting_value, value_type FROM settings WHERE category = ? ORDER BY setting_key',
      [normalizedCategory]
    );

    const result: Record<string, unknown> = {};
    for (const row of rows as PBXPulsSettingRow[]) {
      result[row.setting_key] = parseSettingValue(row.setting_value, row.value_type, undefined);
    }
    return result;
  } catch (error: any) {
    warnSettingsLayer('get category failed', normalizedCategory, error);
    return {};
  }
}

export async function setPBXPulsSetting(
  settingKey: string,
  value: unknown,
  options: PBXPulsSettingOptions = {}
): Promise<boolean> {
  const key = normalizeSettingKey(settingKey);
  if (!key) return false;

  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    const valueType = normalizeValueType(options.valueType || inferSettingValueType(value));
    const serializedValue = serializeSettingValue(value, valueType);
    const rows = await queryPBXPulsDb(
      `UPDATE settings
       SET setting_value = ?, value_type = ?, category = ?, is_secret = ?, description = ?, updated_at = NOW()
       WHERE setting_key = ?`,
      [
        serializedValue,
        valueType,
        normalizeNullableText(options.category),
        options.isSecret || valueType === 'secret' ? 1 : 0,
        normalizeNullableText(options.description),
        key
      ]
    );

    const result = rows as any;
    return Number(result?.affectedRows || 0) > 0;
  } catch (error: any) {
    warnSettingsLayer('set failed', key, error);
    return false;
  }
}

export async function upsertPBXPulsSetting(
  settingKey: string,
  value: unknown,
  options: PBXPulsSettingOptions = {}
): Promise<boolean> {
  const key = normalizeSettingKey(settingKey);
  if (!key) return false;

  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    const valueType = normalizeValueType(options.valueType || inferSettingValueType(value));
    const serializedValue = serializeSettingValue(value, valueType);
    await queryPBXPulsDb(
      `INSERT INTO settings
        (setting_key, setting_value, value_type, category, is_secret, description, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        setting_value = VALUES(setting_value),
        value_type = VALUES(value_type),
        category = VALUES(category),
        is_secret = VALUES(is_secret),
        description = VALUES(description),
        updated_at = NOW()`,
      [
        key,
        serializedValue,
        valueType,
        normalizeNullableText(options.category),
        options.isSecret || valueType === 'secret' ? 1 : 0,
        normalizeNullableText(options.description)
      ]
    );
    return true;
  } catch (error: any) {
    warnSettingsLayer('upsert failed', key, error);
    return false;
  }
}

export function parseSettingValue<T = unknown>(
  rawValue: string | null | undefined,
  valueType: PBXPulsSettingValueType | string,
  fallbackValue?: T
): T | string | number | boolean | unknown | undefined {
  if (rawValue === null || rawValue === undefined) return fallbackValue;

  const normalizedType = normalizeValueType(valueType);

  try {
    if (normalizedType === 'number') {
      const value = Number(rawValue);
      return Number.isFinite(value) ? value : fallbackValue;
    }

    if (normalizedType === 'boolean') {
      const normalized = String(rawValue).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      return fallbackValue;
    }

    if (normalizedType === 'json') {
      return JSON.parse(String(rawValue));
    }

    return String(rawValue);
  } catch (error: any) {
    if (normalizedType === 'json') {
      console.warn('[PBXPULS_SETTINGS] invalid JSON setting value, fallback used');
    } else {
      console.warn('[PBXPULS_SETTINGS] parse failed:', sanitizePBXPulsDbError(error));
    }
    return fallbackValue;
  }
}

export function serializeSettingValue(
  value: unknown,
  valueType: PBXPulsSettingValueType | string = inferSettingValueType(value)
): string | null {
  if (value === null || value === undefined) return null;

  const normalizedType = normalizeValueType(valueType);

  if (normalizedType === 'json') {
    return JSON.stringify(value);
  }

  if (normalizedType === 'boolean') {
    return value === true || value === 'true' || value === 1 || value === '1' ? '1' : '0';
  }

  if (normalizedType === 'number') {
    return Number.isFinite(Number(value)) ? String(Number(value)) : null;
  }

  return String(value);
}

function normalizeSettingKey(settingKey: string): string {
  return String(settingKey || '').trim();
}

function normalizeNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeValueType(valueType: PBXPulsSettingValueType | string): PBXPulsSettingValueType {
  if (['string', 'number', 'boolean', 'json', 'secret'].includes(String(valueType))) {
    return valueType as PBXPulsSettingValueType;
  }
  return 'string';
}

function inferSettingValueType(value: unknown): PBXPulsSettingValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

function warnSettingsLayer(action: string, settingKey: string, error: any): void {
  console.warn('[PBXPULS_SETTINGS]', action, {
    settingKey,
    error: sanitizePBXPulsDbError(error)
  });
}
