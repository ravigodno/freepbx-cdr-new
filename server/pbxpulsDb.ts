import mysql from 'mysql2/promise';

export async function queryPBXPulsDb(sql: string, params: any[] = []): Promise<any[]> {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
      port: Number(process.env.PBXPULS_DB_PORT || 3306),
      user: process.env.PBXPULS_DB_USER || 'pbxpuls',
      password: process.env.PBXPULS_DB_PASS || '',
      database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
      connectTimeout: 5000,
      dateStrings: true
    });

    const [rows] = await connection.execute(sql, params);
    return rows as any[];
  } finally {
    if (connection) await connection.end();
  }
}

export async function isPBXPulsDbAvailable(): Promise<boolean> {
  try {
    await queryPBXPulsDb('SELECT 1 AS ok', []);
    return true;
  } catch (error: any) {
    console.warn('[PBXPULS_DB] unavailable:', sanitizePBXPulsDbError(error));
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
