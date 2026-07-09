import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import {
  canEnableDirectorySqlWrite,
  getDirectoryWriteMode,
  getDirectoryWriteModeBlockedReason,
  type DirectoryWriteMode
} from './pbxpulsDirectoryWriteMode.js';

export type DirectoryWriteOperation = 'create' | 'update' | 'delete';

export interface DirectoryWriteRuntimeDecision {
  operation: DirectoryWriteOperation;
  mode: DirectoryWriteMode;
  useLegacy: boolean;
  useSql: boolean;
  blocked: boolean;
  reason: string;
  productionSqlWriteReady: boolean;
  productionSqlWriteUnlock: boolean;
}

export interface DirectoryWriteRouterStatus {
  ok: true;
  mode: DirectoryWriteMode;
  operations: Record<DirectoryWriteOperation, DirectoryWriteRuntimeDecision>;
  existingDirectoryEndpointsSwitched: false;
  sqlWriteBranchBlocked: boolean;
}

const EXISTING_DIRECTORY_ENDPOINTS_SWITCHED = false;

export async function getDirectoryWriteRuntimeDecision(
  operation: DirectoryWriteOperation,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<DirectoryWriteRuntimeDecision> {
  const mode = await getDirectoryWriteMode();

  if (mode === 'legacy') {
    return {
      operation,
      mode,
      useLegacy: true,
      useSql: false,
      blocked: false,
      reason: 'directory_write_mode_legacy',
      productionSqlWriteReady: false,
      productionSqlWriteUnlock: false
    };
  }

  const sqlEnableDecision = await canEnableDirectorySqlWrite();
  const decision = buildDecisionForSqlReadiness(operation, mode, sqlEnableDecision);
  if (decision.blocked) await writeDirectoryWriteEndpointBlockedEvent(decision, actor);
  return decision;
}

export async function shouldUseLegacyDirectoryWrite(
  operation: DirectoryWriteOperation,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<boolean> {
  const decision = await getDirectoryWriteRuntimeDecision(operation, actor);
  return decision.useLegacy === true;
}

export async function shouldUseSqlDirectoryWrite(
  operation: DirectoryWriteOperation,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<boolean> {
  const decision = await getDirectoryWriteRuntimeDecision(operation, actor);
  return decision.useSql === true;
}

export async function assertDirectorySqlWriteAllowed(
  operation: DirectoryWriteOperation,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<DirectoryWriteRuntimeDecision> {
  const mode = await getDirectoryWriteMode();
  const sqlEnableDecision = await canEnableDirectorySqlWrite();
  const decision = buildDecisionForSqlReadiness(operation, mode === 'sql' ? 'sql' : mode, sqlEnableDecision);
  if (decision.blocked) await writeDirectoryWriteEndpointBlockedEvent(decision, actor);
  return decision;
}

export async function getDirectoryWriteRouterStatus(): Promise<DirectoryWriteRouterStatus> {
  const mode = await getDirectoryWriteMode();
  const sqlEnableDecision = await canEnableDirectorySqlWrite();
  const operations = {
    create: buildDecisionForMode('create', mode, sqlEnableDecision),
    update: buildDecisionForMode('update', mode, sqlEnableDecision),
    delete: buildDecisionForMode('delete', mode, sqlEnableDecision)
  };

  return {
    ok: true,
    mode,
    operations,
    existingDirectoryEndpointsSwitched: EXISTING_DIRECTORY_ENDPOINTS_SWITCHED,
    sqlWriteBranchBlocked: Object.values(operations).some(operation => operation.blocked)
  };
}

export function buildBlockedDirectoryWriteEndpointResponse(decision: DirectoryWriteRuntimeDecision): Record<string, unknown> {
  return {
    ok: false,
    reason: decision.reason || getDirectoryWriteModeBlockedReason(),
    productionSqlWriteReady: decision.productionSqlWriteReady,
    productionSqlWriteUnlock: decision.productionSqlWriteUnlock,
    existingDirectoryEndpointsSwitched: EXISTING_DIRECTORY_ENDPOINTS_SWITCHED
  };
}

function buildDecisionForMode(
  operation: DirectoryWriteOperation,
  mode: DirectoryWriteMode,
  sqlEnableDecision: Awaited<ReturnType<typeof canEnableDirectorySqlWrite>>
): DirectoryWriteRuntimeDecision {
  if (mode === 'legacy') {
    return {
      operation,
      mode,
      useLegacy: true,
      useSql: false,
      blocked: false,
      reason: 'directory_write_mode_legacy',
      productionSqlWriteReady: sqlEnableDecision.canEnable,
      productionSqlWriteUnlock: sqlEnableDecision.productionSqlWriteUnlock
    };
  }

  return buildDecisionForSqlReadiness(operation, mode, sqlEnableDecision);
}

function buildDecisionForSqlReadiness(
  operation: DirectoryWriteOperation,
  mode: DirectoryWriteMode,
  sqlEnableDecision: Awaited<ReturnType<typeof canEnableDirectorySqlWrite>>
): DirectoryWriteRuntimeDecision {
  if (mode === 'sql' && sqlEnableDecision.canEnable) {
    return {
      operation,
      mode,
      useLegacy: false,
      useSql: true,
      blocked: false,
      reason: 'directory_sql_write_ready',
      productionSqlWriteReady: true,
      productionSqlWriteUnlock: sqlEnableDecision.productionSqlWriteUnlock
    };
  }

  return {
    operation,
    mode,
    useLegacy: false,
    useSql: false,
    blocked: true,
    reason: sqlEnableDecision.reason || getDirectoryWriteModeBlockedReason(),
    productionSqlWriteReady: sqlEnableDecision.canEnable,
    productionSqlWriteUnlock: sqlEnableDecision.productionSqlWriteUnlock
  };
}

async function writeDirectoryWriteEndpointBlockedEvent(
  decision: DirectoryWriteRuntimeDecision,
  actor: string | { id?: string | number | null; username?: string | null; role?: string | null }
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: 'directory_write_endpoint_sql_blocked',
    severity: 'warning',
    source: 'pbxpuls_directory_write_router',
    message: 'Directory SQL write endpoint branch blocked',
    details: {
      operation: decision.operation,
      actor: getActorLabel(actor),
      mode: decision.mode,
      reason: decision.reason
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
