import { isPBXPulsDbAvailable, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getPBXPulsSetting, upsertPBXPulsSetting } from './pbxpulsSettings.js';
import { getDirectoryStorageMode } from './pbxpulsDirectoryRuntime.js';

export type DirectoryWriteMode = 'legacy' | 'sql';

export interface DirectoryWriteModeStatus {
  ok: boolean;
  mode: DirectoryWriteMode;
  allowedModes: DirectoryWriteMode[];
  canEnableSql: boolean;
  reason: string | null;
  existingDirectoryEndpointsSwitched: boolean;
  writeLayerAvailable: boolean;
  productionSqlWriteUnlock: boolean;
  isolatedSqlWriteSmokePassed: boolean;
  productionSqlWriteReady: boolean;
  productionSqlWriteBlockReason: string | null;
}

export interface DirectoryWriteModeSetResult extends DirectoryWriteModeStatus {
  previousMode: DirectoryWriteMode;
  requestedMode: DirectoryWriteMode;
  changed: boolean;
}

const DIRECTORY_WRITE_MODE_KEY = 'directory.write_mode';
const DIRECTORY_SQL_WRITE_TEST_ENABLED_KEY = 'directory.sql_write_test_enabled';
const DIRECTORY_PRODUCTION_SQL_WRITE_UNLOCK_KEY = 'directory.production_sql_write_unlock';
const SQL_WRITE_BLOCK_REASON = 'directory_sql_write_runtime_not_connected';
const PRODUCTION_SQL_WRITE_NOT_UNLOCKED_REASON = 'production_sql_write_not_unlocked';
const ISOLATED_SQL_WRITE_SMOKE_PASSED = true;
const EXISTING_DIRECTORY_ENDPOINTS_SWITCHED = false;

export async function getDirectoryWriteMode(): Promise<DirectoryWriteMode> {
  const mode = await getPBXPulsSetting<DirectoryWriteMode>(DIRECTORY_WRITE_MODE_KEY, 'legacy');
  return normalizeDirectoryWriteMode(mode) || 'legacy';
}

export async function getDirectoryWriteModeStatus(): Promise<DirectoryWriteModeStatus> {
  const [mode, writeLayerAvailable, sqlEnableDecision] = await Promise.all([
    getDirectoryWriteMode(),
    isPBXPulsDbAvailable(),
    canEnableDirectorySqlWrite()
  ]);

  return {
    ok: true,
    mode,
    allowedModes: ['legacy', 'sql'],
    canEnableSql: sqlEnableDecision.canEnable,
    reason: sqlEnableDecision.reason,
    existingDirectoryEndpointsSwitched: EXISTING_DIRECTORY_ENDPOINTS_SWITCHED,
    writeLayerAvailable,
    productionSqlWriteUnlock: sqlEnableDecision.productionSqlWriteUnlock,
    isolatedSqlWriteSmokePassed: sqlEnableDecision.isolatedSqlWriteSmokePassed,
    productionSqlWriteReady: sqlEnableDecision.canEnable,
    productionSqlWriteBlockReason: sqlEnableDecision.reason
  };
}

export async function canEnableDirectorySqlWrite(): Promise<{
  canEnable: boolean;
  reason: string | null;
  sqlAvailable: boolean;
  writeLayerAvailable: boolean;
  isolatedSqlWriteSmokePassed: boolean;
  directoryStorageMode: 'legacy' | 'sql';
  sqlWriteTestEnabled: boolean;
  productionSqlWriteUnlock: boolean;
}> {
  const [
    sqlAvailable,
    directoryStorageMode,
    sqlWriteTestEnabledValue,
    productionSqlWriteUnlockValue
  ] = await Promise.all([
    isPBXPulsDbAvailable(),
    getDirectoryStorageMode(),
    getPBXPulsSetting<unknown>(DIRECTORY_SQL_WRITE_TEST_ENABLED_KEY, false),
    getPBXPulsSetting<unknown>(DIRECTORY_PRODUCTION_SQL_WRITE_UNLOCK_KEY, false)
  ]);

  const writeLayerAvailable = sqlAvailable;
  const sqlWriteTestEnabled = normalizeBoolean(sqlWriteTestEnabledValue);
  const productionSqlWriteUnlock = normalizeBoolean(productionSqlWriteUnlockValue);
  let reason: string | null = null;

  if (!sqlAvailable) reason = 'directory_sql_unavailable';
  else if (!writeLayerAvailable) reason = 'directory_sql_write_layer_unavailable';
  else if (!ISOLATED_SQL_WRITE_SMOKE_PASSED) reason = 'isolated_sql_write_smoke_not_passed';
  else if (sqlWriteTestEnabled) reason = 'directory_sql_write_test_still_enabled';
  else if (!productionSqlWriteUnlock) reason = PRODUCTION_SQL_WRITE_NOT_UNLOCKED_REASON;

  return {
    canEnable: reason === null,
    reason,
    sqlAvailable,
    writeLayerAvailable,
    isolatedSqlWriteSmokePassed: ISOLATED_SQL_WRITE_SMOKE_PASSED,
    directoryStorageMode,
    sqlWriteTestEnabled,
    productionSqlWriteUnlock
  };
}

export async function getDirectoryProductionSqlWriteUnlock(): Promise<boolean> {
  const value = await getPBXPulsSetting<unknown>(DIRECTORY_PRODUCTION_SQL_WRITE_UNLOCK_KEY, false);
  return normalizeBoolean(value);
}

export function getDirectoryProductionSqlWriteNotUnlockedReason(): string {
  return PRODUCTION_SQL_WRITE_NOT_UNLOCKED_REASON;
}

export function hasDirectoryIsolatedSqlWriteSmokePassed(): boolean {
  return ISOLATED_SQL_WRITE_SMOKE_PASSED;
}

export function getDirectoryWriteModeRuntimeBlockedReason(): string {
  return SQL_WRITE_BLOCK_REASON;
}

export async function setDirectoryWriteMode(
  mode: DirectoryWriteMode,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<DirectoryWriteModeSetResult> {
  const requestedMode = normalizeDirectoryWriteMode(mode);
  if (!requestedMode) throw new Error('Invalid directory write mode');

  const previousMode = await getDirectoryWriteMode();

  if (requestedMode === 'sql') {
    const decision = await canEnableDirectorySqlWrite();
    if (!decision.canEnable) {
      await writeDirectoryWriteModeEvent('directory_write_mode_blocked', previousMode, requestedMode, actor, decision.reason);
      return {
        ...(await getDirectoryWriteModeStatus()),
        ok: false,
        previousMode,
        requestedMode,
        changed: false,
        reason: decision.reason
      };
    }
  }

  const updated = await upsertPBXPulsSetting(DIRECTORY_WRITE_MODE_KEY, requestedMode, {
    valueType: 'string',
    category: 'directory',
    isSecret: false,
    description: 'Controls PBXPuls Directory write source: legacy or sql'
  });

  if (!updated) throw new Error('Failed to update directory write mode');

  await writeDirectoryWriteModeEvent('directory_write_mode_changed', previousMode, requestedMode, actor, null);

  return {
    ...(await getDirectoryWriteModeStatus()),
    previousMode,
    requestedMode,
    changed: previousMode !== requestedMode
  };
}

export function getDirectoryWriteModeBlockedReason(): string {
  return PRODUCTION_SQL_WRITE_NOT_UNLOCKED_REASON;
}

export function sanitizeDirectoryWriteModeError(error: any): string {
  return sanitizePBXPulsDbError(error);
}

function normalizeDirectoryWriteMode(value: unknown): DirectoryWriteMode | null {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'legacy' || mode === 'sql') return mode;
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

async function writeDirectoryWriteModeEvent(
  eventType: 'directory_write_mode_changed' | 'directory_write_mode_blocked',
  from: DirectoryWriteMode,
  to: DirectoryWriteMode,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null },
  reason: string | null
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: eventType,
    severity: eventType === 'directory_write_mode_blocked' ? 'warning' : 'info',
    source: 'pbxpuls_directory_write_mode',
    message: eventType === 'directory_write_mode_blocked'
      ? 'Directory write mode change blocked'
      : 'Directory write mode changed',
    details: {
      from,
      to,
      actor: getActorLabel(actor),
      reason
    }
  });
}

function getActorLabel(actor: string | { id?: string | number | null; username?: string | null; role?: string | null }): string {
  if (typeof actor === 'string') return safeText(actor, 64) || 'unknown';
  return safeText(actor?.role || actor?.username || actor?.id || 'unknown', 64) || 'unknown';
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}
