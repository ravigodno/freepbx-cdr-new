import { queryPBXPulsDb, withPBXPulsTransaction } from '../../pbxpulsDb.js';

export interface AiPlatformStore {
  query(sql: string, params?: unknown[]): Promise<any[]>;
  transaction?<T>(work:(store:AiPlatformStore)=>Promise<T>):Promise<T>;
}

export const sqlAiPlatformStore: AiPlatformStore = {
  query: (sql, params = []) => queryPBXPulsDb(sql, params as any[]),
  transaction:work=>withPBXPulsTransaction(connection=>work({
    query:async(sql,params=[])=>{const [rows]=await connection.execute(sql,params as any[]);return rows as any[];},
  })),
};

export function affectedRows(value: any): number { return Number(value?.affectedRows || 0); }
export function insertId(value: any): number { return Number(value?.insertId || 0); }
