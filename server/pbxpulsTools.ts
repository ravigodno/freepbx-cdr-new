import { isPBXPulsDbAvailable, queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';

export interface PBXPulsTool {
  id: number;
  tool_key: string;
  name: string;
  description: string | null;
  category: string | null;
  is_enabled: boolean;
  is_system: boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UpsertPBXPulsToolOptions {
  toolKey: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  isEnabled?: unknown;
  isSystem?: unknown;
  sortOrder?: unknown;
}

interface PBXPulsToolRow {
  id: number;
  tool_key: string;
  name: string;
  description: string | null;
  category: string | null;
  is_enabled: number | boolean;
  is_system: number | boolean;
  sort_order: number;
  created_at?: string | null;
  updated_at?: string | null;
}

const TOOL_KEY_MAX_LENGTH = 100;
const TOOL_NAME_MAX_LENGTH = 191;
const TOOL_DESCRIPTION_MAX_LENGTH = 255;
const TOOL_CATEGORY_MAX_LENGTH = 100;

/**
 * Return the SQL tools registry ordered for future module registry use.
 * This helper is backend-only and is not connected to runtime navigation.
 */
export async function getPBXPulsTools(): Promise<PBXPulsTool[]> {
  try {
    if (!(await isPBXPulsDbAvailable())) return [];

    const rows = await queryPBXPulsDb(
      `SELECT id, tool_key, name, description, category, is_enabled, is_system, sort_order, created_at, updated_at
       FROM tools
       ORDER BY sort_order ASC, id ASC`,
      []
    );

    return (rows as PBXPulsToolRow[]).map(mapToolRow);
  } catch (error: any) {
    warnToolsLayer('list failed', null, error);
    return [];
  }
}

/**
 * Return one registered tool by tool_key, or null when missing/unavailable.
 */
export async function getPBXPulsTool(toolKey: string): Promise<PBXPulsTool | null> {
  const key = normalizeToolKey(toolKey);
  if (!key) return null;

  try {
    if (!(await isPBXPulsDbAvailable())) return null;

    const rows = await queryPBXPulsDb(
      `SELECT id, tool_key, name, description, category, is_enabled, is_system, sort_order, created_at, updated_at
       FROM tools
       WHERE tool_key = ?
       LIMIT 1`,
      [key]
    );

    const row = rows[0] as PBXPulsToolRow | undefined;
    return row ? mapToolRow(row) : null;
  } catch (error: any) {
    warnToolsLayer('get failed', key, error);
    return null;
  }
}

/**
 * Check whether a tool is enabled. Missing SQL, missing rows and errors use fallbackValue.
 */
export async function isPBXPulsToolEnabled(toolKey: string, fallbackValue = true): Promise<boolean> {
  const key = normalizeToolKey(toolKey);
  if (!key) return normalizeBooleanFlag(fallbackValue, true);

  try {
    if (!(await isPBXPulsDbAvailable())) return normalizeBooleanFlag(fallbackValue, true);

    const rows = await queryPBXPulsDb(
      'SELECT is_enabled FROM tools WHERE tool_key = ? LIMIT 1',
      [key]
    );
    const row = rows[0] as Pick<PBXPulsToolRow, 'is_enabled'> | undefined;
    if (!row) return normalizeBooleanFlag(fallbackValue, true);

    return normalizeBooleanFlag(row.is_enabled, normalizeBooleanFlag(fallbackValue, true));
  } catch (error: any) {
    warnToolsLayer('enabled check failed', key, error);
    return normalizeBooleanFlag(fallbackValue, true);
  }
}

/**
 * Enable/disable an existing tool only. It does not insert missing rows.
 */
export async function setPBXPulsToolEnabled(toolKey: string, enabled: unknown): Promise<boolean> {
  const key = normalizeToolKey(toolKey);
  if (!key) return false;

  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    const result = await queryPBXPulsDb(
      `UPDATE tools
       SET is_enabled = ?, updated_at = NOW()
       WHERE tool_key = ?`,
      [normalizeBooleanFlag(enabled, false) ? 1 : 0, key]
    );

    return Number((result as any)?.affectedRows || 0) > 0;
  } catch (error: any) {
    warnToolsLayer('enabled update failed', key, error);
    return false;
  }
}

/**
 * Insert a new tool or update only fields explicitly provided in options.
 * Existing values are preserved unless the corresponding option key is present.
 */
export async function upsertPBXPulsTool(options: UpsertPBXPulsToolOptions): Promise<boolean> {
  const key = normalizeToolKey(options && options.toolKey);
  if (!key) return false;

  try {
    if (!(await isPBXPulsDbAvailable())) return false;

    const existingTool = await getPBXPulsTool(key);
    if (existingTool) {
      return updateExistingTool(key, options);
    }

    await queryPBXPulsDb(
      `INSERT INTO tools
        (tool_key, name, description, category, is_enabled, is_system, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        key,
        normalizeRequiredText(options.name, key, TOOL_NAME_MAX_LENGTH),
        normalizeNullableText(options.description, TOOL_DESCRIPTION_MAX_LENGTH),
        normalizeNullableText(options.category, TOOL_CATEGORY_MAX_LENGTH),
        normalizeBooleanFlag(options.isEnabled, true) ? 1 : 0,
        normalizeBooleanFlag(options.isSystem, false) ? 1 : 0,
        normalizeSortOrder(options.sortOrder, 100)
      ]
    );
    return true;
  } catch (error: any) {
    warnToolsLayer('upsert failed', key, error);
    return false;
  }
}

async function updateExistingTool(toolKey: string, options: UpsertPBXPulsToolOptions): Promise<boolean> {
  const assignments: string[] = [];
  const values: any[] = [];

  if (Object.prototype.hasOwnProperty.call(options, 'name')) {
    assignments.push('name = ?');
    values.push(normalizeRequiredText(options.name, toolKey, TOOL_NAME_MAX_LENGTH));
  }

  if (Object.prototype.hasOwnProperty.call(options, 'description')) {
    assignments.push('description = ?');
    values.push(normalizeNullableText(options.description, TOOL_DESCRIPTION_MAX_LENGTH));
  }

  if (Object.prototype.hasOwnProperty.call(options, 'category')) {
    assignments.push('category = ?');
    values.push(normalizeNullableText(options.category, TOOL_CATEGORY_MAX_LENGTH));
  }

  if (Object.prototype.hasOwnProperty.call(options, 'isEnabled')) {
    assignments.push('is_enabled = ?');
    values.push(normalizeBooleanFlag(options.isEnabled, true) ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(options, 'isSystem')) {
    assignments.push('is_system = ?');
    values.push(normalizeBooleanFlag(options.isSystem, false) ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(options, 'sortOrder')) {
    assignments.push('sort_order = ?');
    values.push(normalizeSortOrder(options.sortOrder, 100));
  }

  if (!assignments.length) return true;

  values.push(toolKey);
  const result = await queryPBXPulsDb(
    `UPDATE tools
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE tool_key = ?`,
    values
  );

  return Number((result as any)?.affectedRows || 0) > 0;
}

function mapToolRow(row: PBXPulsToolRow): PBXPulsTool {
  return {
    id: Number(row.id),
    tool_key: String(row.tool_key || ''),
    name: String(row.name || ''),
    description: normalizeNullableText(row.description, TOOL_DESCRIPTION_MAX_LENGTH),
    category: normalizeNullableText(row.category, TOOL_CATEGORY_MAX_LENGTH),
    is_enabled: normalizeBooleanFlag(row.is_enabled, true),
    is_system: normalizeBooleanFlag(row.is_system, false),
    sort_order: normalizeSortOrder(row.sort_order, 100),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

function normalizeToolKey(toolKey: unknown): string {
  const key = String(toolKey ?? '').trim();
  if (!key) return '';
  return key.slice(0, TOOL_KEY_MAX_LENGTH);
}

function normalizeBooleanFlag(value: unknown, fallbackValue: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;

  return fallbackValue;
}

function normalizeSortOrder(value: unknown, fallbackValue: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallbackValue;
  return Math.trunc(numericValue);
}

function normalizeRequiredText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim() || fallback;
  return text.slice(0, maxLength);
}

function normalizeNullableText(value: unknown, maxLength: number): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function warnToolsLayer(action: string, toolKey: string | null, error: any): void {
  console.warn('[PBXPULS_TOOLS]', action, {
    toolKey,
    error: sanitizePBXPulsDbError(error)
  });
}
