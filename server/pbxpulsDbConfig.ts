export type PBXPulsDbConfigSource = 'env' | 'default';

export interface PBXPulsDbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  passwordPresent: boolean;
  configured: boolean;
  source: PBXPulsDbConfigSource;
}

export function getPBXPulsDbConfig(): PBXPulsDbConfig {
  const password = process.env.PBXPULS_DB_PASSWORD ?? process.env.PBXPULS_DB_PASS ?? '';
  const explicit = [
    process.env.PBXPULS_DB_HOST,
    process.env.PBXPULS_DB_PORT,
    process.env.PBXPULS_DB_NAME,
    process.env.PBXPULS_DB_USER,
    process.env.PBXPULS_DB_PASSWORD,
    process.env.PBXPULS_DB_PASS
  ].some(value => value !== undefined && value !== '');

  return {
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password,
    passwordPresent: password.length > 0,
    configured: explicit && password.length > 0,
    source: explicit ? 'env' : 'default'
  };
}

export function getPBXPulsDbConnectionOptions() {
  const config = getPBXPulsDbConfig();
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 2500,
    dateStrings: true
  };
}

export function getPBXPulsDbConfigLogFields() {
  const config = getPBXPulsDbConfig();
  return {
    dbHost: config.host,
    dbName: config.database,
    dbUser: config.user,
    passwordPresent: config.passwordPresent,
    source: config.source
  };
}
