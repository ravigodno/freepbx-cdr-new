import { queryPBXPulsDb, withPBXPulsTransaction } from './pbxpulsDb.js';

export function normalizeDepartmentKey(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').slice(0, 191);
}

export function normalizeDepartmentNames(values: unknown): string[] {
  const names = Array.isArray(values) ? values : [];
  const unique = new Map<string, string>();
  for (const value of names) {
    const name = String(value || '').trim().slice(0, 191);
    const key = normalizeDepartmentKey(name);
    if (key && !unique.has(key)) unique.set(key, name);
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'ru-RU'));
}

export async function getUserDepartmentScopes(username: string): Promise<string[]> {
  const rows = await queryPBXPulsDb(
    'SELECT department_name FROM user_department_call_scopes WHERE username=? ORDER BY department_name',
    [String(username || '').trim().slice(0, 100)]
  );
  return rows.map(row => String(row.department_name || '').trim()).filter(Boolean);
}

export async function setUserDepartmentScopes(username: string, departments: unknown): Promise<string[]> {
  const safeUsername = String(username || '').trim().slice(0, 100);
  const names = normalizeDepartmentNames(departments);
  await withPBXPulsTransaction(async connection => {
    await connection.execute('DELETE FROM user_department_call_scopes WHERE username=?', [safeUsername]);
    for (const name of names) {
      await connection.execute(
        'INSERT INTO user_department_call_scopes(username,department_name,department_key) VALUES(?,?,?)',
        [safeUsername, name, normalizeDepartmentKey(name)]
      );
    }
  });
  return names;
}

export async function renameUserDepartmentScopes(previousUsername: string, nextUsername: string): Promise<void> {
  const previous = String(previousUsername || '').trim().slice(0, 100);
  const next = String(nextUsername || '').trim().slice(0, 100);
  if (!previous || !next || previous.toLowerCase() === next.toLowerCase()) return;
  await queryPBXPulsDb('UPDATE user_department_call_scopes SET username=?,updated_at=NOW() WHERE username=?', [next, previous]);
}

export async function deleteUserDepartmentScopes(username: string): Promise<void> {
  await queryPBXPulsDb('DELETE FROM user_department_call_scopes WHERE username=?', [String(username || '').trim().slice(0, 100)]);
}

function internalExtension(entry: any): string {
  const candidates = [entry?.internalExtension, entry?.number, ...(Array.isArray(entry?.phones) ? entry.phones : [])];
  return candidates.map(value => String(value || '').replace(/\D/g, '')).find(value => /^\d{2,6}$/.test(value)) || '';
}

export function getDepartmentExtensions(directory: any[], departments: unknown): string[] {
  const keys = new Set(normalizeDepartmentNames(departments).map(normalizeDepartmentKey));
  if (!keys.size) return [];
  return Array.from(new Set((directory || [])
    .filter(entry => keys.has(normalizeDepartmentKey(entry?.department)))
    .map(internalExtension)
    .filter(Boolean)));
}

export function callMatchesExtensions(call: any, extensions: string[]): boolean {
  if (!extensions.length) return false;
  const allowed = new Set(extensions);
  const values = [call?.src, call?.dst, call?.cnum, call?.outbound_cnum, call?.channel, call?.dstchannel,
    call?.lastdata, call?.did, call?.internalCaller, call?.destinationNumber,
    ...(Array.isArray(call?.answeredExts) ? call.answeredExts : []),
    ...(Array.isArray(call?.missedExts) ? call.missedExts : [])];
  return values.some(value => (String(value || '').match(/\d+/g) || []).some(token => allowed.has(token)));
}
