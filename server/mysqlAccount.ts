import type { Connection } from 'mysql2/promise';
/** MariaDB 5.5 compatible; never changes credentials of an existing account. */
export async function ensureMysqlAccount(connection: Connection, user:string, host:string, password:string) {
  const [rows] = await connection.query('SELECT User FROM mysql.user WHERE User=? AND Host=?', [user,host]);
  if ((rows as any[]).length) return false;
  try { await connection.query(`CREATE USER ${connection.escape(user)}@${connection.escape(host)} IDENTIFIED BY ${connection.escape(password)}`); }
  catch (error:any) {
    const [existing] = await connection.query('SELECT User FROM mysql.user WHERE User=? AND Host=?', [user,host]);
    if (!(existing as any[]).length) throw error;
  }
  return true;
}
