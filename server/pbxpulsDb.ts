import mysql from 'mysql2/promise';
import { getPBXPulsDbConfig, getPBXPulsDbConfigLogFields, getPBXPulsDbConnectionOptions } from './pbxpulsDbConfig.js';

const RETRY_AFTER_MS = 60_000;
const LOG_THROTTLE_MS = 60_000;
let unavailableUntil = 0;
let lastError = '';
let lastLogAt = 0;
let lastSuccessfulAt = 0;

function markUnavailable(error: any): void {
  lastError = sanitizePBXPulsDbError(error);
  unavailableUntil = Date.now() + RETRY_AFTER_MS;
  if (Date.now() - lastLogAt >= LOG_THROTTLE_MS) {
    lastLogAt = Date.now();
    console.warn('[PBXPULS_DB] unavailable:', lastError, getPBXPulsDbConfigLogFields());
  }
}

export function getPBXPulsDbRuntimeStatus() {
  const config = getPBXPulsDbConfig();
  const available = config.configured && lastSuccessfulAt > 0 && Date.now() >= unavailableUntil;
  return {
    pbxpulsDbConfigured: config.configured,
    pbxpulsDbAvailable: available,
    qualityCacheAvailable: available,
    reason: available ? null : (lastError || 'PBXPuls DB access denied / not configured'),
    dbName: config.database,
    dbUser: config.user,
    passwordPresent: config.passwordPresent,
    source: config.source
  };
}

export async function queryPBXPulsDb(sql: string, params: any[] = []): Promise<any[]> {
  const config = getPBXPulsDbConfig();
  if (!config.configured) throw new Error('PBXPuls DB access denied / not configured');
  if (Date.now() < unavailableUntil) throw new Error(lastError || 'PBXPuls DB temporarily unavailable');
  let connection;
  try {
    connection = await mysql.createConnection(getPBXPulsDbConnectionOptions());

    const [rows] = await connection.execute(sql, params);
    unavailableUntil = 0;
    lastError = '';
    lastSuccessfulAt = Date.now();
    return rows as any[];
  } catch (error) {
    markUnavailable(error);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

export async function isPBXPulsDbAvailable(): Promise<boolean> {
  try {
    await queryPBXPulsDb('SELECT 1 AS ok', []);
    return true;
  } catch (error: any) {
    return false;
  }
}

export function sanitizePBXPulsDbError(error: any): string {
  const message = String(error?.message || error || 'unknown error');
  return message
    .replace(/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s;,)]+/gi, '$1=********')
    .replace(/mysql:\/\/[^@\s]+@/gi, 'mysql://********@')
    .slice(0, 500);
}
