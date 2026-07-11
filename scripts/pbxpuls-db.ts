import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mysql, { ConnectionOptions } from 'mysql2/promise';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const setup = process.argv.includes('--setup');
const requiredTables = [
  'schema_migrations', 'settings', 'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'tools', 'audit_log', 'system_events', 'directory_contacts', 'directory_contact_metadata',
  'directory_custom_fields', 'quality_current', 'quality_history', 'monitoring_health_history',
  'monitoring_quality_alerts', 'monitoring_devices_history', 'monitoring_devices_alerts',
  'monitoring_devices_conflicts', 'monitoring_devices_map'
];

function parseFreePBXConfig(): Record<string, string> {
  try {
    const source = fs.readFileSync('/etc/freepbx.conf', 'utf8');
    const values: Record<string, string> = {};
    for (const key of ['AMPDBHOST', 'AMPDBUSER', 'AMPDBPASS']) {
      const match = source.match(new RegExp(`(?:define\\(\\s*['"]${key}['"]\\s*,\\s*|\\$amp_conf\\[['"]${key}['"]\\]\\s*=\\s*)['"]([^'"]*)['"]`));
      if (match) values[key] = match[1];
    }
    return values;
  } catch {
    return {};
  }
}

function runtimeConfig(passwordOverride?: string) {
  const password = passwordOverride ?? process.env.PBXPULS_DB_PASSWORD ?? process.env.PBXPULS_DB_PASS ?? '';
  return {
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password
  };
}

async function connect(options: ConnectionOptions) {
  return mysql.createConnection({ ...options, connectTimeout: 2500, dateStrings: true });
}

async function findAdminConnection() {
  const freepbx = parseFreePBXConfig();
  const candidates: Array<{ source: string; options: ConnectionOptions }> = [
    { source: 'root_socket', options: { user: 'root', socketPath: '/var/lib/mysql/mysql.sock' } },
    { source: 'root_socket', options: { user: 'root', socketPath: '/run/mysqld/mysqld.sock' } }
  ];
  if (freepbx.AMPDBUSER) candidates.push({
    source: 'freepbx',
    options: { host: freepbx.AMPDBHOST || '127.0.0.1', user: freepbx.AMPDBUSER, password: freepbx.AMPDBPASS || '' }
  });
  for (const candidate of candidates) {
    try {
      return { connection: await connect(candidate.options), source: candidate.source };
    } catch {}
  }
  return null;
}

function appendEnv(config: ReturnType<typeof runtimeConfig>) {
  const envPath = path.join(process.cwd(), '.env');
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const additions = [
    ['PBXPULS_DB_HOST', config.host], ['PBXPULS_DB_PORT', String(config.port)],
    ['PBXPULS_DB_NAME', config.database], ['PBXPULS_DB_USER', config.user],
    ['PBXPULS_DB_PASSWORD', config.password]
  ].filter(([key]) => !new RegExp(`^${key}=`, 'm').test(existing));
  if (!additions.length) return;
  fs.appendFileSync(envPath, `${existing.endsWith('\n') || !existing ? '' : '\n'}${additions.map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
}

function printManualInstructions() {
  console.error('Automatic bootstrap is unavailable. Run as a MariaDB administrator:');
  console.error(`read -s PBXPULS_DB_PASSWORD
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS pbxpuls CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'pbxpuls'@'localhost' IDENTIFIED BY '$PBXPULS_DB_PASSWORD';
CREATE USER IF NOT EXISTS 'pbxpuls'@'127.0.0.1' IDENTIFIED BY '$PBXPULS_DB_PASSWORD';
GRANT ALL PRIVILEGES ON pbxpuls.* TO 'pbxpuls'@'localhost';
GRANT ALL PRIVILEGES ON pbxpuls.* TO 'pbxpuls'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL`);
  console.error('Then set PBXPULS_DB_PASSWORD to the same value in .env and run npm run pbxpuls:db:setup again.');
}

async function inspect() {
  const config = runtimeConfig();
  const result: any = {
    pbxpulsDbConfigured: Boolean(config.password), pbxpulsDbConnected: false,
    dbName: config.database, dbUser: config.user, passwordPresent: Boolean(config.password),
    migrationsOk: false, qualityCacheAvailable: false
  };
  if (!config.password) return result;
  try {
    const connection = await connect(config);
    const [rows] = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [config.database]);
    const [grantRows] = await connection.query('SHOW GRANTS FOR CURRENT_USER');
    await connection.end();
    const tables = new Set((rows as any[]).map(row => String(row.TABLE_NAME)));
    result.pbxpulsDbConnected = true;
    result.dbUserPresent = true;
    const grants = (grantRows as any[]).flatMap(row => Object.values(row).map(String)).join('\n').toUpperCase();
    result.privilegesOk = grants.includes('ALL PRIVILEGES') || ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'].every(privilege => grants.includes(privilege));
    result.missingTables = requiredTables.filter(table => !tables.has(table));
    result.migrationsOk = result.missingTables.length === 0;
    result.qualityCacheAvailable = tables.has('quality_current') && tables.has('quality_history');
  } catch (error: any) {
    result.reason = String(error?.message || error).replace(/(password|passwd)\s*[:=]\s*\S+/gi, '$1=********').slice(0, 300);
  }
  return result;
}

async function main() {
  let status = await inspect();
  if (!setup) {
    console.log(JSON.stringify(status, null, 2));
    process.exitCode = status.qualityCacheAvailable ? 0 : 1;
    return;
  }

  let config = runtimeConfig();
  if (!status.pbxpulsDbConnected) {
    const admin = await findAdminConnection();
    if (!admin) {
      console.log(JSON.stringify(status, null, 2));
      printManualInstructions();
      process.exitCode = 1;
      return;
    }
    if (!config.password) config = runtimeConfig(crypto.randomBytes(24).toString('base64url'));
    if (!/^[A-Za-z0-9_$-]+$/.test(config.database) || !/^[A-Za-z0-9_$.-]+$/.test(config.user)) {
      throw new Error('PBXPuls DB name or user contains unsupported characters');
    }
    const db = config.database;
    const user = config.user;
    try {
      await admin.connection.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      for (const host of ['localhost', '127.0.0.1']) {
        await admin.connection.query(`CREATE USER IF NOT EXISTS '${user}'@'${host}' IDENTIFIED BY ${admin.connection.escape(config.password)}`);
        await admin.connection.query(`GRANT ALL PRIVILEGES ON \`${db}\`.* TO '${user}'@'${host}'`);
      }
      await admin.connection.query('FLUSH PRIVILEGES');
      appendEnv(config);
      process.env.PBXPULS_DB_PASSWORD = config.password;
      console.error(`PBXPuls DB bootstrap completed via ${admin.source}; password was written to .env and was not printed.`);
    } catch (error: any) {
      console.error(`PBXPuls DB bootstrap failed via ${admin.source}: ${String(error?.message || error).slice(0, 300)}`);
      printManualInstructions();
      process.exitCode = 1;
      return;
    } finally {
      await admin.connection.end();
    }
  }

  const { runPBXPulsMigrations } = await import('../server/pbxpulsMigrations.js');
  await runPBXPulsMigrations();
  status = await inspect();
  console.log(JSON.stringify(status, null, 2));
  process.exitCode = status.qualityCacheAvailable ? 0 : 1;
}

main().catch(error => {
  console.error(String(error?.message || error).slice(0, 500));
  process.exitCode = 1;
});
