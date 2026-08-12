import crypto from 'crypto';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Express, Request, Response } from 'express';
import { writePBXPulsAuditLog } from './pbxpulsEvents.js';

const run = promisify(execFile);
const ODBC_INI = '/etc/odbc.ini';
const ODBCINST_INI = '/etc/odbcinst.ini';
const PREVIEW_TTL_MS = 10 * 60_000;
type PackageManager = 'yum' | 'apt-get' | null;
const previews = new Map<string, { user: string; expiresAt: number; sourceHash: string; actions: string[]; installRequired: boolean; packageManager: PackageManager; packageName: string }>();

type IniSection = Record<string, string>;

export type CdrEncodingStatus = {
  state: 'healthy' | 'repairable' | 'manual_required' | 'unsupported';
  message: string;
  os: { id: string; version: string; supported: boolean };
  connector: { mariaDbInstalled: boolean; mysqlInstalled: boolean; installAvailable: boolean; packageManager: PackageManager; packageName: string };
  driver: { registered: boolean; libraryPath: string; libraryExists: boolean };
  dsn: { exists: boolean; driver: string; charset: string };
  checks: Array<{ key: string; ok: boolean; label: string }>;
  secretsMasked: true;
};

function parseIniSection(source: string, sectionName: string): IniSection | null {
  const lines = source.split(/\r?\n/);
  let active = false;
  const values: IniSection = {};
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (section) {
      if (active) break;
      active = section[1].trim().toLowerCase() === sectionName.toLowerCase();
      continue;
    }
    if (!active || /^\s*[#;]/.test(line)) continue;
    const item = line.match(/^\s*([^=]+?)\s*=\s*(.*?)\s*$/);
    if (item) values[item[1].trim().toLowerCase()] = item[2].trim();
  }
  return active ? values : null;
}

function replaceIniValue(source: string, sectionName: string, key: string, value: string): string {
  const lines = source.split(/\r?\n/);
  let sectionStart = -1;
  let sectionEnd = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const section = lines[index].match(/^\s*\[([^\]]+)]\s*$/);
    if (!section) continue;
    if (sectionStart >= 0) { sectionEnd = index; break; }
    if (section[1].trim().toLowerCase() === sectionName.toLowerCase()) sectionStart = index;
  }
  if (sectionStart < 0) throw new Error('CDR ODBC DSN не найден');
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'i');
  for (let index = sectionStart + 1; index < sectionEnd; index += 1) {
    if (keyPattern.test(lines[index])) { lines[index] = `${key}=${value}`; return lines.join('\n'); }
  }
  lines.splice(sectionEnd, 0, `${key}=${value}`);
  return lines.join('\n');
}

function configHash(source: string): string {
  return crypto.createHash('sha256').update(source).digest('hex');
}

async function packageInstalled(name: string, manager: PackageManager): Promise<boolean> {
  if (!manager) return false;
  try {
    if (manager === 'yum') await run('/usr/bin/rpm', ['-q', name], { timeout: 5000, maxBuffer: 64 * 1024 });
    else await run('/usr/bin/dpkg-query', ['-W', '-f=${Status}', name], { timeout: 5000, maxBuffer: 64 * 1024 });
    return true;
  }
  catch { return false; }
}

function resolvePackageManager(os: Record<string, string>, available = {
  yum: fs.existsSync('/usr/bin/yum'),
  aptGet: fs.existsSync('/usr/bin/apt-get'),
  dpkgQuery: fs.existsSync('/usr/bin/dpkg-query')
}): { manager: PackageManager; packageName: string; supported: boolean } {
  const family = `${os.ID || ''} ${os.ID_LIKE || ''}`.toLowerCase();
  if (/(sangoma|centos|rhel|fedora)/.test(family) && available.yum) {
    return { manager: 'yum', packageName: 'mariadb-connector-odbc', supported: true };
  }
  if (/(debian|ubuntu)/.test(family) && available.aptGet && available.dpkgQuery) {
    return { manager: 'apt-get', packageName: 'odbc-mariadb', supported: true };
  }
  return { manager: null, packageName: '', supported: false };
}

function readOsRelease(): Record<string, string> {
  try {
    return Object.fromEntries(fs.readFileSync('/etc/os-release', 'utf8').split(/\r?\n/).map(line => {
      const index = line.indexOf('=');
      return index > 0 ? [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')] : ['', ''];
    }).filter(([key]) => key));
  } catch { return {}; }
}

export async function inspectCdrEncoding(): Promise<CdrEncodingStatus> {
  const os = readOsRelease();
  const packageTarget = resolvePackageManager(os);
  const supported = packageTarget.supported;
  const [mariaDbInstalled, mysqlInstalled] = await Promise.all([
    packageInstalled(packageTarget.packageName, packageTarget.manager),
    packageTarget.manager === 'yum'
      ? packageInstalled('mysql-connector-odbc', packageTarget.manager)
      : packageInstalled('libmyodbc', packageTarget.manager)
  ]);
  const odbc = fs.existsSync(ODBC_INI) ? fs.readFileSync(ODBC_INI, 'utf8') : '';
  const drivers = fs.existsSync(ODBCINST_INI) ? fs.readFileSync(ODBCINST_INI, 'utf8') : '';
  const dsn = parseIniSection(odbc, 'MySQL-asteriskcdrdb');
  const driver = parseIniSection(drivers, 'MariaDB');
  const libraryPath = String(driver?.driver64 || driver?.driver || '');
  const registered = Boolean(driver && libraryPath);
  const libraryExists = Boolean(libraryPath && fs.existsSync(libraryPath));
  const dsnDriver = String(dsn?.driver || '');
  const charset = String(dsn?.charset || '');
  const driverUsable = registered && libraryExists;
  const installAvailable = supported && Boolean(packageTarget.manager && packageTarget.packageName);
  const effectiveMariaDbInstalled = mariaDbInstalled || driverUsable;
  const checks = [
    { key: 'mariadb_package', ok: effectiveMariaDbInstalled, label: 'MariaDB ODBC доступен' },
    { key: 'mariadb_driver', ok: registered && libraryExists, label: 'Драйвер MariaDB зарегистрирован' },
    { key: 'cdr_dsn', ok: Boolean(dsn), label: 'DSN MySQL-asteriskcdrdb найден' },
    { key: 'dsn_driver', ok: dsnDriver.toLowerCase() === 'mariadb', label: 'CDR использует драйвер MariaDB' },
    { key: 'charset', ok: /^utf-?8(?:mb4)?$/i.test(charset), label: 'Для CDR задан UTF-8' }
  ];
  const healthy = driverUsable && Boolean(dsn) && dsnDriver.toLowerCase() === 'mariadb' && /^utf-?8(?:mb4)?$/i.test(charset);
  const repairable = supported && Boolean(dsn) && (driverUsable || installAvailable);
  const state = healthy ? 'healthy' : repairable ? 'repairable' : supported ? 'manual_required' : 'unsupported';
  return {
    state,
    message: healthy ? 'Кодировка CDR настроена правильно' : repairable ? 'Конфигурацию DSN можно безопасно исправить' : supported ? 'Требуется ручная установка MariaDB ODBC' : 'Автоматическое исправление для этой ОС не поддерживается',
    os: { id: String(os.ID || 'unknown'), version: String(os.VERSION_ID || ''), supported },
    connector: { mariaDbInstalled: effectiveMariaDbInstalled, mysqlInstalled, installAvailable, packageManager: packageTarget.manager, packageName: packageTarget.packageName },
    driver: { registered, libraryPath, libraryExists },
    dsn: { exists: Boolean(dsn), driver: dsnDriver, charset }, checks, secretsMasked: true
  };
}

async function createPreview(user: string) {
  const status = await inspectCdrEncoding();
  const source = fs.existsSync(ODBC_INI) ? fs.readFileSync(ODBC_INI, 'utf8') : '';
  const installRequired = !(status.driver.registered && status.driver.libraryExists);
  const actions = status.state === 'repairable' ? [
    ...(installRequired ? [`Установить пакет ${status.connector.packageName} через ${status.connector.packageManager} без удаления других пакетов`] : []),
    'Создать резервную копию /etc/odbc.ini',
    'Установить driver=MariaDB для MySQL-asteriskcdrdb',
    'Установить Charset=utf8 для MySQL-asteriskcdrdb',
    'Повторно проверить драйвер, DSN и UTF-8'
  ] : [];
  const previewId = crypto.randomUUID();
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  previews.set(previewId, { user, expiresAt, sourceHash: configHash(source), actions, installRequired, packageManager: status.connector.packageManager, packageName: status.connector.packageName });
  return { previewId, expiresAt: new Date(expiresAt).toISOString(), status, actions, applyAllowed: status.state === 'repairable', restartRequired: status.state === 'repairable' };
}

async function applyPreview(previewId: string, user: string) {
  const preview = previews.get(previewId);
  if (!preview || preview.user !== user || preview.expiresAt <= Date.now()) throw new Error('Предпросмотр устарел. Выполните проверку повторно.');
  let status = await inspectCdrEncoding();
  if (status.state !== 'repairable') throw new Error(status.state === 'healthy' ? 'Исправление уже применено' : 'Автоматическое исправление недоступно');
  const stat = fs.lstatSync(ODBC_INI);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Небезопасный тип /etc/odbc.ini');
  const source = fs.readFileSync(ODBC_INI, 'utf8');
  if (configHash(source) !== preview.sourceHash) throw new Error('Конфигурация изменилась после preview. Повторите проверку.');
  let packageInstalledByApply = false;
  if (preview.installRequired) {
    if (!status.connector.installAvailable) throw new Error('Автоматическая установка MariaDB ODBC недоступна на этой системе');
    try {
      if (preview.packageManager === 'yum' && preview.packageName === 'mariadb-connector-odbc') {
        await run('/usr/bin/yum', ['-y', 'install', preview.packageName], { timeout: 180_000, maxBuffer: 3 * 1024 * 1024 });
      } else if (preview.packageManager === 'apt-get' && preview.packageName === 'odbc-mariadb') {
        const aptOptions = { timeout: 180_000, maxBuffer: 3 * 1024 * 1024, env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } };
        await run('/usr/bin/apt-get', ['update'], aptOptions);
        await run('/usr/bin/apt-get', ['-y', 'install', preview.packageName], aptOptions);
      } else {
        throw new Error('Неподдерживаемый пакетный менеджер в preview');
      }
      packageInstalledByApply = true;
    } catch (error: any) {
      throw new Error(`Не удалось установить MariaDB ODBC: ${String(error?.code || 'yum_failed').slice(0, 80)}`);
    }
    status = await inspectCdrEncoding();
    if (!(status.driver.registered && status.driver.libraryExists)) throw new Error('Пакет установлен, но драйвер MariaDB не зарегистрирован');
    if (configHash(fs.readFileSync(ODBC_INI, 'utf8')) !== preview.sourceHash) throw new Error('Установка пакета изменила DSN. Выполните проверку повторно.');
  }
  let next = replaceIniValue(source, 'MySQL-asteriskcdrdb', 'driver', 'MariaDB');
  next = replaceIniValue(next, 'MySQL-asteriskcdrdb', 'Charset', 'utf8');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${ODBC_INI}.pbxpuls-${stamp}.bak`;
  const temporaryPath = `${ODBC_INI}.pbxpuls-${process.pid}-${crypto.randomUUID()}.tmp`;
  fs.copyFileSync(ODBC_INI, backupPath, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(temporaryPath, next, { encoding: 'utf8', mode: stat.mode });
  fs.chownSync(temporaryPath, stat.uid, stat.gid);
  fs.renameSync(temporaryPath, ODBC_INI);
  previews.delete(previewId);
  const finalStatus = await inspectCdrEncoding();
  if (finalStatus.state !== 'healthy') throw new Error('Исправление применено не полностью; проверьте ODBC вручную');
  return { success: true, backupPath, packageInstalled: packageInstalledByApply, status: finalStatus, restartRequired: true, restartPerformed: false };
}

export function registerCdrEncodingRepairRoutes(app: Express, deps: { requireAuth: any; checkPermission: (req: Request, permission: string) => Promise<boolean> }) {
  const authorized = async (req: Request, res: Response) => {
    const user: any = (req as any).user || {};
    if (!['su', 'admin'].includes(String(user.role || '')) || !(await deps.checkPermission(req, 'view_cli'))) {
      res.status(403).json({ success: false, error: 'Доступ разрешён только администраторам Командного центра' }); return false;
    }
    return true;
  };
  const actor = (req: Request) => String((req as any).user?.username || (req as any).user?.id || 'admin');
  app.get('/api/monitoring/cdr-encoding/status', deps.requireAuth(), async (req, res) => {
    if (!await authorized(req, res)) return;
    try { res.json({ success: true, status: await inspectCdrEncoding() }); }
    catch { res.status(500).json({ success: false, error: 'Не удалось проверить кодировку CDR' }); }
  });
  app.post('/api/monitoring/cdr-encoding/preview', deps.requireAuth(), async (req, res) => {
    if (!await authorized(req, res)) return;
    try { res.json({ success: true, ...(await createPreview(actor(req))) }); }
    catch { res.status(500).json({ success: false, error: 'Не удалось подготовить исправление' }); }
  });
  app.post('/api/monitoring/cdr-encoding/apply', deps.requireAuth(), async (req, res) => {
    if (!await authorized(req, res)) return;
    if (req.body?.confirm !== true) return res.status(400).json({ success: false, error: 'Требуется явное подтверждение' });
    try {
      const result = await applyPreview(String(req.body?.previewId || ''), actor(req));
      await writePBXPulsAuditLog({ actor_label: actor(req), action: 'monitoring.cdr_encoding.repaired', entity_type: 'system_config', entity_id: 'odbc.ini', details: { backupCreated: true, restartRequired: true }, ip_address: req.ip, user_agent: req.get('user-agent') });
      res.json(result);
    } catch (error: any) { res.status(409).json({ success: false, error: String(error?.message || 'Не удалось применить исправление').slice(0, 300) }); }
  });
}

export const cdrEncodingRepairInternals = { parseIniSection, replaceIniValue, resolvePackageManager };
