import { queryPBXPulsDb } from '../../pbxpulsDb.js';

export interface AiPlatformStore {
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

export const sqlAiPlatformStore: AiPlatformStore = {
  query: (sql, params = []) => queryPBXPulsDb(sql, params as any[])
};

export function affectedRows(value: any): number { return Number(value?.affectedRows || 0); }
export function insertId(value: any): number { return Number(value?.insertId || 0); }
