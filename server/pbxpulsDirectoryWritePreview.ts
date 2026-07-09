import {
  normalizeDirectoryContactForSql,
  validateDirectoryContactInput,
  type DirectorySqlActor,
  type DirectorySqlContactInput,
  type NormalizedDirectorySqlContact
} from './pbxpulsDirectoryWrite.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getDirectoryWriteMode } from './pbxpulsDirectoryWriteMode.js';

export type DirectoryWritePreviewOperation = 'create' | 'update' | 'delete';

export interface DirectoryWritePreviewResult {
  ok: boolean;
  dryRun: true;
  operation: DirectoryWritePreviewOperation;
  writeMode: 'legacy' | 'sql';
  sqlWriteEnabled: boolean;
  wouldWriteSql: false;
  validation: {
    ok: boolean;
    reason?: string;
  };
  normalizedShape?: {
    hasName: boolean;
    hasCompany: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
    hasMetadata: boolean;
    metadataKeysCount: number;
  };
  target?: {
    hasId: boolean;
  };
  reason: string;
}

const PREVIEW_SUCCESS_REASON = 'preview_only_no_write_performed';
const PREVIEW_VALIDATION_FAILED_REASON = 'directory_sql_write_preview_validation_failed';

export async function previewCreateDirectoryContactSql(
  input: DirectorySqlContactInput,
  actor: DirectorySqlActor | string
): Promise<DirectoryWritePreviewResult> {
  return previewValidatedContact('create', input, actor);
}

export async function previewUpdateDirectoryContactSql(
  id: string,
  input: DirectorySqlContactInput,
  actor: DirectorySqlActor | string
): Promise<DirectoryWritePreviewResult> {
  const targetId = safeText(id, 64);
  if (!targetId) {
    return previewValidationFailed('update', actor, 'directory_contact_id_required');
  }

  return previewValidatedContact('update', { ...input, id: targetId }, actor);
}

export async function previewDeleteDirectoryContactSql(
  id: string,
  actor: DirectorySqlActor | string
): Promise<DirectoryWritePreviewResult> {
  const writeMode = await getDirectoryWriteMode();
  const hasId = !!safeText(id, 64);
  if (!hasId) {
    const result: DirectoryWritePreviewResult = {
      ok: false,
      dryRun: true,
      operation: 'delete',
      writeMode,
      sqlWriteEnabled: false,
      wouldWriteSql: false,
      validation: {
        ok: false,
        reason: 'directory_contact_id_required'
      },
      target: {
        hasId: false
      },
      reason: PREVIEW_VALIDATION_FAILED_REASON
    };
    await writePreviewAuditEvent('delete', actor, false, PREVIEW_VALIDATION_FAILED_REASON);
    return result;
  }

  const result: DirectoryWritePreviewResult = {
    ok: true,
    dryRun: true,
    operation: 'delete',
    writeMode,
    sqlWriteEnabled: false,
    wouldWriteSql: false,
    validation: {
      ok: true
    },
    target: {
      hasId: true
    },
    reason: PREVIEW_SUCCESS_REASON
  };
  await writePreviewAuditEvent('delete', actor, true, PREVIEW_SUCCESS_REASON);
  return result;
}

async function previewValidatedContact(
  operation: 'create' | 'update',
  input: DirectorySqlContactInput,
  actor: DirectorySqlActor | string
): Promise<DirectoryWritePreviewResult> {
  const writeMode = await getDirectoryWriteMode();

  try {
    const normalized = normalizeDirectoryContactForSql(input, actor);
    validateDirectoryContactInput(normalized);

    const result: DirectoryWritePreviewResult = {
      ok: true,
      dryRun: true,
      operation,
      writeMode,
      sqlWriteEnabled: false,
      wouldWriteSql: false,
      validation: {
        ok: true
      },
      normalizedShape: buildNormalizedShape(normalized),
      reason: PREVIEW_SUCCESS_REASON
    };
    await writePreviewAuditEvent(operation, actor, true, PREVIEW_SUCCESS_REASON);
    return result;
  } catch (error: any) {
    const result: DirectoryWritePreviewResult = {
      ok: false,
      dryRun: true,
      operation,
      writeMode,
      sqlWriteEnabled: false,
      wouldWriteSql: false,
      validation: {
        ok: false,
        reason: safeValidationReason(error)
      },
      reason: PREVIEW_VALIDATION_FAILED_REASON
    };
    await writePreviewAuditEvent(operation, actor, false, PREVIEW_VALIDATION_FAILED_REASON);
    return result;
  }
}

async function previewValidationFailed(
  operation: DirectoryWritePreviewOperation,
  actor: DirectorySqlActor | string,
  validationReason: string
): Promise<DirectoryWritePreviewResult> {
  const writeMode = await getDirectoryWriteMode();
  const result: DirectoryWritePreviewResult = {
    ok: false,
    dryRun: true,
    operation,
    writeMode,
    sqlWriteEnabled: false,
    wouldWriteSql: false,
    validation: {
      ok: false,
      reason: validationReason
    },
    target: {
      hasId: false
    },
    reason: PREVIEW_VALIDATION_FAILED_REASON
  };
  await writePreviewAuditEvent(operation, actor, false, PREVIEW_VALIDATION_FAILED_REASON);
  return result;
}

function buildNormalizedShape(normalized: NormalizedDirectorySqlContact): DirectoryWritePreviewResult['normalizedShape'] {
  const metadataKeys = Object.keys(normalized.metadata || {}).filter(Boolean);
  return {
    hasName: !!normalized.name,
    hasCompany: !!normalized.company,
    hasPhone: !!normalized.phone,
    hasEmail: !!normalized.email,
    hasMetadata: metadataKeys.length > 0,
    metadataKeysCount: metadataKeys.length
  };
}

async function writePreviewAuditEvent(
  operation: DirectoryWritePreviewOperation,
  actor: DirectorySqlActor | string,
  validationOk: boolean,
  reason: string
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: 'directory_write_preview_checked',
    severity: validationOk ? 'info' : 'warning',
    source: 'pbxpuls_directory_write_preview',
    message: 'Directory SQL write preview checked',
    details: {
      operation,
      actor: getActorLabel(actor),
      dryRun: true,
      validationOk,
      reason
    }
  });
}

function safeValidationReason(error: any): string {
  const message = String(error?.message || error || 'validation_failed').trim();
  if (!message) return 'validation_failed';
  return message
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w .:-]/g, '')
    .slice(0, 160);
}

function getActorLabel(actor: DirectorySqlActor | string): string {
  if (typeof actor === 'string') return safeText(actor, 64) || 'unknown';
  return safeText(actor?.role || actor?.username || actor?.id || 'unknown', 64) || 'unknown';
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}
