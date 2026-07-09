import { isPBXPulsDbAvailable, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getPBXPulsSetting, upsertPBXPulsSetting } from './pbxpulsSettings.js';

export type DirectoryWriteMode = 'legacy' | 'sql';

export interface DirectoryWriteModeStatus {
  ok: boolean;
  mode: DirectoryWriteMode;
  allowedModes: DirectoryWriteMode[];
  canEnableSql: boolean;
  reason: string | null;
  existingDirectoryEndpointsSwitched: boolean;
  writeLayerAvailable: boolean;
}

export interface DirectoryWriteModeSetResult extends DirectoryWriteModeStatus {
  previousMode: DirectoryWriteMode;
  requestedMode: DirectoryWriteMode;
  changed: boolean;
}

const DIRECTORY_WRITE_MODE_KEY = 'directory.write_mode';
const SQL_WRITE_BLOCK_REASON = 'directory_sql_write_runtime_not_connected';
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
    writeLayerAvailable
  };
}

export async function canEnableDirectorySqlWrite(): Promise<{ canEnable: boolean; reason: string | null }> {
  if (!EXISTING_DIRECTORY_ENDPOINTS_SWITCHED) {
    return {
      canEnable: false,
      reason: SQL_WRITE_BLOCK_REASON
    };
  }

  return {
    canEnable: true,
    reason: null
  };
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
  return SQL_WRITE_BLOCK_REASON;
}

export function sanitizeDirectoryWriteModeError(error: any): string {
  return sanitizePBXPulsDbError(error);
}

function normalizeDirectoryWriteMode(value: unknown): DirectoryWriteMode | null {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'legacy' || mode === 'sql') return mode;
  return null;
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
