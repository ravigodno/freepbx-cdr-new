import { isPBXPulsDbAvailable } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getPBXPulsSetting } from './pbxpulsSettings.js';
import {
  createDirectoryContactSql,
  deleteDirectoryContactSql,
  isDirectorySqlWriteLayerAvailable,
  updateDirectoryContactSql
} from './pbxpulsDirectoryWrite.js';
import { getDirectoryStorageMode } from './pbxpulsDirectoryRuntime.js';
import { getDirectoryWriteMode } from './pbxpulsDirectoryWriteMode.js';

export interface DirectorySqlWriteTestStatus {
  ok: boolean;
  enabled: boolean;
  canRun: boolean;
  reason: string | null;
  sqlAvailable: boolean;
  writeLayerAvailable: boolean;
  directoryWriteMode: 'legacy' | 'sql';
  directoryStorageMode: 'legacy' | 'sql';
  productionWriteEndpointsUseSql: false;
  isolatedTestOnly: true;
}

export interface DirectorySqlWriteTestPayload {
  hasName: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasComment: boolean;
  hasMetadata: boolean;
  metadataKeysCount: number;
}

export interface DirectorySqlWriteTestSmokeResult {
  ok: boolean;
  sqlWritePerformed: boolean;
  operation: 'create_update_delete';
  created: boolean;
  updated: boolean;
  deleted: boolean;
  cleanupOk: boolean;
  testContactId: string;
  safeShape: DirectorySqlWriteTestPayload;
  productionWriteEndpointsUseSql: false;
  isolatedTestOnly: true;
}

const DIRECTORY_SQL_WRITE_TEST_ENABLED_KEY = 'directory.sql_write_test_enabled';
const SQL_WRITE_TEST_DISABLED_REASON = 'directory_sql_write_test_disabled';
const DIRECTORY_SQL_WRITE_TEST_CONFIRM = 'PBXPULS_SQL_WRITE_TEST_ONLY';

export async function getDirectorySqlWriteTestStatus(): Promise<DirectorySqlWriteTestStatus> {
  const [enabledValue, sqlAvailable, writeLayerAvailable, directoryWriteMode, directoryStorageMode] = await Promise.all([
    getPBXPulsSetting<unknown>(DIRECTORY_SQL_WRITE_TEST_ENABLED_KEY, false),
    isPBXPulsDbAvailable(),
    isDirectorySqlWriteLayerAvailable(),
    getDirectoryWriteMode(),
    getDirectoryStorageMode()
  ]);

  const enabled = normalizeBoolean(enabledValue);
  const reason = getBlockReason({
    enabled,
    sqlAvailable,
    writeLayerAvailable,
    directoryWriteMode,
    directoryStorageMode
  });

  return {
    ok: true,
    enabled,
    canRun: reason === null,
    reason,
    sqlAvailable,
    writeLayerAvailable,
    directoryWriteMode,
    directoryStorageMode,
    productionWriteEndpointsUseSql: false,
    isolatedTestOnly: true
  };
}

export async function canRunDirectorySqlWriteTest(): Promise<boolean> {
  const status = await getDirectorySqlWriteTestStatus();
  return status.canRun === true;
}

export async function assertDirectorySqlWriteTestAllowed(
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null } = 'unknown'
): Promise<DirectorySqlWriteTestStatus> {
  const status = await getDirectorySqlWriteTestStatus();
  if (!status.canRun) {
    await writeDirectorySqlWriteTestBlockedEvent(actor, status.reason || SQL_WRITE_TEST_DISABLED_REASON);
  }
  return status;
}

export function validateSqlWriteTestPayload(input: any): { ok: boolean; reason?: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'directory_sql_write_test_payload_required' };
  }

  const name = safeText(input.name, 255);
  const phone = safeText(input.phone || input.number, 64);
  if (!name) return { ok: false, reason: 'directory_sql_write_test_name_required' };
  if (!phone) return { ok: false, reason: 'directory_sql_write_test_phone_required' };

  return { ok: true };
}

export function buildSqlWriteTestPayload(input: any): DirectorySqlWriteTestPayload {
  const metadata = input?.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
    ? input.metadata
    : {};
  const metadataKeys = Object.keys(metadata).filter(Boolean);

  return {
    hasName: !!safeText(input?.name, 255),
    hasPhone: !!safeText(input?.phone || input?.number, 64),
    hasEmail: !!safeText(input?.email, 255),
    hasComment: !!safeText(input?.comment, 65535),
    hasMetadata: metadataKeys.length > 0,
    metadataKeysCount: metadataKeys.length
  };
}

export async function runDirectorySqlWriteTest(
  input: any,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null } = 'unknown'
): Promise<DirectorySqlWriteTestSmokeResult> {
  const validation = validateSqlWriteTestPayload(input);
  if (!validation.ok) throw new Error(validation.reason || 'directory_sql_write_test_payload_invalid');

  const testContactId = `dir_sql_write_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const safeShape = buildSqlWriteTestPayload(input);
  let created = false;
  let updated = false;
  let deleted = false;

  await writeDirectorySqlWriteTestEvent('directory_sql_write_test_started', 'warning', actor, {
    testContactId,
    sqlWritePerformed: false
  });

  try {
    await createDirectoryContactSql({
      ...input,
      id: testContactId,
      contact_type: 'common',
      owner_user_id: null
    }, actor);
    created = true;

    await updateDirectoryContactSql(testContactId, {
      ...input,
      id: testContactId,
      name: `${safeText(input.name, 200)} UPDATED`,
      phone: safeText(input.phone || input.number, 60) || '0000000001',
      contact_type: 'common',
      owner_user_id: null
    }, actor);
    updated = true;

    await deleteDirectoryContactSql(testContactId, actor);
    deleted = true;

    await writeDirectorySqlWriteTestEvent('directory_sql_write_test_completed', 'info', actor, {
      testContactId,
      sqlWritePerformed: true,
      created,
      updated,
      deleted,
      cleanupOk: deleted
    });

    return {
      ok: true,
      sqlWritePerformed: true,
      operation: 'create_update_delete',
      created,
      updated,
      deleted,
      cleanupOk: deleted,
      testContactId,
      safeShape,
      productionWriteEndpointsUseSql: false,
      isolatedTestOnly: true
    };
  } catch (error: any) {
    if (created && !deleted) {
      try {
        await deleteDirectoryContactSql(testContactId, actor);
        deleted = true;
      } catch (_cleanupError) {
        deleted = false;
      }
    }

    await writeDirectorySqlWriteTestEvent('directory_sql_write_test_failed', 'error', actor, {
      testContactId,
      sqlWritePerformed: created || updated || deleted,
      created,
      updated,
      deleted,
      cleanupOk: deleted,
      reason: 'directory_sql_write_test_failed'
    });

    throw new Error('directory_sql_write_test_failed');
  }
}

export async function writeDirectorySqlWriteTestBlockedEvent(
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null },
  reason: string
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: 'directory_sql_write_test_blocked',
    severity: 'warning',
    source: 'pbxpuls_directory_sql_write_test',
    message: 'Directory SQL write test blocked',
    details: {
      actor: getActorLabel(actor),
      reason,
      sqlWritePerformed: false
    }
  });
}

export function getDirectorySqlWriteTestDisabledReason(): string {
  return SQL_WRITE_TEST_DISABLED_REASON;
}

export function getDirectorySqlWriteTestConfirmPhrase(): string {
  return DIRECTORY_SQL_WRITE_TEST_CONFIRM;
}

function getBlockReason(input: {
  enabled: boolean;
  sqlAvailable: boolean;
  writeLayerAvailable: boolean;
  directoryWriteMode: 'legacy' | 'sql';
  directoryStorageMode: 'legacy' | 'sql';
}): string | null {
  if (!input.enabled) return SQL_WRITE_TEST_DISABLED_REASON;
  if (!input.sqlAvailable) return 'directory_sql_unavailable';
  if (!input.writeLayerAvailable) return 'directory_sql_write_layer_unavailable';
  if (input.directoryWriteMode !== 'legacy') return 'directory_write_mode_not_legacy';
  if (input.directoryStorageMode !== 'legacy') return 'directory_storage_mode_not_legacy';
  return null;
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true) return true;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getActorLabel(actor: string | { id?: string | number | null; username?: string | null; role?: string | null }): string {
  if (typeof actor === 'string') return safeText(actor, 64) || 'unknown';
  return safeText(actor?.role || actor?.username || actor?.id || 'unknown', 64) || 'unknown';
}

async function writeDirectorySqlWriteTestEvent(
  eventType: string,
  severity: 'info' | 'warning' | 'error',
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null },
  details: Record<string, unknown>
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: eventType,
    severity,
    source: 'pbxpuls_directory_sql_write_test',
    message: 'Directory SQL write test lifecycle event',
    details: {
      actor: getActorLabel(actor),
      ...details
    }
  });
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}
