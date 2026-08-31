import crypto from 'crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { queryPBXPulsDb } from '../pbxpulsDb.js';
import { buildSoftphoneAutoConfig, type SoftphoneAutoConfigSource } from './autoConfig.js';
import { SoftphoneCredentialCrypto } from './credentialCrypto.js';

interface Dependencies {
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => void;
  checkPermission: (req: Request, permission: string) => Promise<boolean>;
  resolveAutoConfigSource: (req: Request) => Promise<SoftphoneAutoConfigSource>;
}

type ProfileInput = {
  enabled: boolean;
  extension: string;
  websocketUrl: string;
  sipUri: string;
  authorizationUsername: string;
  authorizationPassword: string;
  replacePassword: boolean;
  displayName: string;
};

const previews = new Map<string, { username: string; input: ProfileInput; expiresAt: number; actor: string }>();
const autoPreviews = new Map<string, { username: string; input: ProfileInput; expiresAt: number; actor: string }>();
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);
const cleanUsername = (value: unknown) => clean(value, 100).toLowerCase();
const isAdmin = (req: Request) => ['su', 'admin'].includes(String((req as any).user?.role || ''));

function validate(input: any): ProfileInput {
  const websocketUrl = clean(input?.websocketUrl, 500);
  const sipUri = clean(input?.sipUri, 255);
  const authorizationUsername = clean(input?.authorizationUsername, 191);
  const authorizationPassword = String(input?.authorizationPassword || '');
  const extension = clean(input?.extension, 32);
  if (websocketUrl && !/^wss:\/\//i.test(websocketUrl)) throw new Error('WebSocket URL должен начинаться с wss://');
  if (sipUri && !/^sip:[^@\s]+@[^@\s]+$/i.test(sipUri)) throw new Error('Некорректный SIP URI');
  if (extension && !/^[0-9*#+]{1,32}$/.test(extension)) throw new Error('Некорректный внутренний номер');
  if (authorizationPassword.length > 255) throw new Error('SIP-пароль слишком длинный');
  if (input?.enabled === true && (!websocketUrl || !sipUri || !authorizationUsername)) throw new Error('Для включения заполните WSS URL, SIP URI и имя авторизации');
  return { enabled: input?.enabled === true, extension, websocketUrl, sipUri, authorizationUsername, authorizationPassword, replacePassword: input?.replacePassword === true, displayName: clean(input?.displayName, 191) };
}

function safeProfile(row: any) {
  return {
    username: row.username,
    enabled: row.enabled === 1 || row.enabled === true,
    extension: row.extension || '',
    websocketUrl: row.websocket_url || '',
    sipUri: row.sip_uri || '',
    authorizationUsername: row.authorization_username || '',
    hasPassword: Boolean(row.password_encrypted),
    displayName: row.display_name || '',
    updatedAt: row.updated_at || null
  };
}

async function canManage(req: Request, dependencies: Dependencies): Promise<boolean> {
  return isAdmin(req) || await dependencies.checkPermission(req, 'manage_softphone_profiles') || await dependencies.checkPermission(req, 'manage_users');
}

export function registerSoftphoneRoutes(app: Express, dependencies: Dependencies): void {
  const auth = dependencies.requireAuth();
  const encryption = new SoftphoneCredentialCrypto();

  app.get('/api/softphone/profile', auth, async (req, res) => {
    try {
      const username = cleanUsername((req as any).user?.username);
      const rows = await queryPBXPulsDb('SELECT * FROM softphone_profiles WHERE username=? LIMIT 1', [username]);
      const row = rows[0];
      res.setHeader('Cache-Control', 'no-store');
      if (!row) return res.json({ configured: false, enabled: false, encryptionReady: encryption.ready() });
      return res.json({ configured: true, encryptionReady: encryption.ready(), profile: safeProfile(row) });
    } catch {
      return res.status(503).json({ error: 'Softphone profile storage unavailable' });
    }
  });

  app.post('/api/softphone/runtime-config', auth, async (req, res) => {
    try {
      if (!(await dependencies.checkPermission(req, 'make_calls'))) return res.status(403).json({ error: 'Нет права на совершение звонков' });
      const username = cleanUsername((req as any).user?.username);
      const rows = await queryPBXPulsDb('SELECT * FROM softphone_profiles WHERE username=? AND enabled=1 LIMIT 1', [username]);
      const row = rows[0];
      if (!row || !row.password_encrypted) return res.status(409).json({ error: 'Гарнитура не настроена администратором' });
      const authorizationPassword = encryption.decrypt(row.password_encrypted);
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('Pragma', 'no-cache');
      return res.json({
        websocketUrl: row.websocket_url,
        sipUri: row.sip_uri,
        authorizationUsername: row.authorization_username,
        authorizationPassword,
        displayName: row.display_name || undefined
      });
    } catch (error: any) {
      const status = error?.message === 'softphone_encryption_not_configured' ? 503 : 500;
      return res.status(status).json({ error: status === 503 ? 'Шифрование WebRTC-профилей не настроено' : 'Не удалось выдать WebRTC-конфигурацию' });
    }
  });

  app.get('/api/softphone/profiles', auth, async (req, res) => {
    if (!(await canManage(req, dependencies))) return res.status(403).json({ error: 'Недостаточно прав' });
    const rows = await queryPBXPulsDb('SELECT * FROM softphone_profiles ORDER BY username', []);
    return res.json({ profiles: rows.map(safeProfile), encryptionReady: encryption.ready() });
  });

  app.post('/api/softphone/auto-config/preview', auth, async (req, res) => {
    try {
      if (!(await dependencies.checkPermission(req, 'make_calls'))) return res.status(403).json({ error: 'Нет права на совершение звонков' });
      const username = cleanUsername((req as any).user?.username);
      if (!username) return res.status(400).json({ error: 'Пользователь не указан' });
      const source = await dependencies.resolveAutoConfigSource(req);
      const discovered = buildSoftphoneAutoConfig({ ...source, username });
      const existing = (await queryPBXPulsDb('SELECT password_encrypted FROM softphone_profiles WHERE username=? LIMIT 1', [username]))[0];
      if (!discovered.profile.authorizationPassword && existing?.password_encrypted) {
        discovered.profile.authorizationPassword = '';
        discovered.profile.replacePassword = false;
        const secretCheck = discovered.checks.find(check => check.key === 'secret');
        if (secretCheck) {
          secretCheck.status = 'ok';
          secretCheck.message = 'Будет использован ранее сохранённый зашифрованный SIP-секрет';
        }
        discovered.ready = discovered.checks.every(check => check.status !== 'error');
        discovered.profile.enabled = discovered.ready;
      }
      if (discovered.ready && !encryption.ready()) {
        discovered.ready = false;
        discovered.profile.enabled = false;
        discovered.checks.push({ key: 'encryption', status: 'error', message: 'Шифрование WebRTC-профилей PBXPuls не настроено' });
      } else if (encryption.ready()) {
        discovered.checks.push({ key: 'encryption', status: 'ok', message: 'SIP-секрет будет сохранён с AES-256-GCM' });
      }
      const previewId = crypto.randomBytes(24).toString('hex');
      if (discovered.ready) {
        autoPreviews.set(previewId, { username, input: discovered.profile, actor: username, expiresAt: Date.now() + 5 * 60_000 });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        ready: discovered.ready,
        previewId: discovered.ready ? previewId : null,
        expiresInSeconds: discovered.ready ? 300 : 0,
        profile: {
          username,
          extension: discovered.profile.extension,
          websocketUrl: discovered.profile.websocketUrl,
          sipUri: discovered.profile.sipUri,
          authorizationUsername: discovered.profile.authorizationUsername,
          displayName: discovered.profile.displayName,
          hasPassword: Boolean(discovered.profile.authorizationPassword || existing?.password_encrypted)
        },
        checks: discovered.checks,
        changes: ['Будет изменён только WebRTC-профиль PBXPuls в MariaDB', 'FreePBX и endpoint изменены не будут', 'SIP-секрет скрыт в preview и выдаётся только авторизованной runtime-сессии без кеширования']
      });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'Не удалось проверить настройки АТС' });
    }
  });

  app.post('/api/softphone/auto-config/apply', auth, async (req, res) => {
    if (!(await dependencies.checkPermission(req, 'make_calls'))) return res.status(403).json({ error: 'Нет права на совершение звонков' });
    const username = cleanUsername((req as any).user?.username);
    const previewId = clean(req.body?.previewId, 64);
    const preview = autoPreviews.get(previewId);
    autoPreviews.delete(previewId);
    if (!preview || preview.expiresAt < Date.now() || preview.username !== username) return res.status(409).json({ error: 'Preview отсутствует или устарел' });
    try {
      const current = (await queryPBXPulsDb('SELECT password_encrypted,password_key_version FROM softphone_profiles WHERE username=? LIMIT 1', [username]))[0];
      let encryptedPassword = current?.password_encrypted || null;
      let keyVersion = current?.password_key_version || null;
      if (preview.input.authorizationPassword) {
        const encrypted = encryption.encrypt(preview.input.authorizationPassword);
        encryptedPassword = encrypted.ciphertext;
        keyVersion = encrypted.keyVersion;
      }
      if (!encryptedPassword) return res.status(409).json({ error: 'SIP-секрет не найден; профиль не сохранён' });
      await queryPBXPulsDb(`INSERT INTO softphone_profiles
        (username,extension,enabled,websocket_url,sip_uri,authorization_username,password_encrypted,password_key_version,display_name,updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE extension=VALUES(extension),enabled=VALUES(enabled),websocket_url=VALUES(websocket_url),sip_uri=VALUES(sip_uri),authorization_username=VALUES(authorization_username),password_encrypted=VALUES(password_encrypted),password_key_version=VALUES(password_key_version),display_name=VALUES(display_name),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
        [username, preview.input.extension, 1, preview.input.websocketUrl, preview.input.sipUri, preview.input.authorizationUsername, encryptedPassword, keyVersion, preview.input.displayName || null, username]);
      await queryPBXPulsDb('INSERT INTO softphone_profile_audit(username,actor,event_type,details_json) VALUES(?,?,?,?)', [username, username, 'auto_profile_applied', JSON.stringify({ enabled: true, extension: preview.input.extension, passwordChanged: Boolean(preview.input.authorizationPassword), freepbxChanged: false })]);
      return res.json({ success: true, username, freepbxChanged: false });
    } catch (error: any) {
      const status = error?.message === 'softphone_encryption_not_configured' ? 503 : 500;
      return res.status(status).json({ error: status === 503 ? 'Шифрование WebRTC-профилей не настроено' : 'Не удалось сохранить WebRTC-профиль' });
    }
  });

  app.post('/api/softphone/profiles/:username/preview', auth, async (req, res) => {
    if (!(await canManage(req, dependencies))) return res.status(403).json({ error: 'Недостаточно прав' });
    try {
      const username = cleanUsername(req.params.username);
      if (!username) return res.status(400).json({ error: 'Пользователь не указан' });
      const input = validate(req.body);
      const existing = (await queryPBXPulsDb('SELECT password_encrypted FROM softphone_profiles WHERE username=? LIMIT 1', [username]))[0];
      if (input.enabled && !input.authorizationPassword && !existing?.password_encrypted) return res.status(400).json({ error: 'Для первого включения укажите SIP-пароль' });
      if (input.authorizationPassword && !encryption.ready()) return res.status(503).json({ error: 'Задайте PBXPULS_SOFTPHONE_ENCRYPTION_KEY перед сохранением пароля' });
      const previewId = crypto.randomBytes(24).toString('hex');
      previews.set(previewId, { username, input, actor: cleanUsername((req as any).user?.username), expiresAt: Date.now() + 5 * 60_000 });
      return res.json({
        previewId, expiresInSeconds: 300,
        profile: { username, ...input, authorizationPassword: undefined, hasPassword: Boolean(input.authorizationPassword || existing?.password_encrypted) },
        changes: ['Профиль будет сохранён только в MariaDB', 'Конфигурация FreePBX изменена не будет']
      });
    } catch (error: any) {
      return res.status(400).json({ error: error?.message || 'Некорректный профиль' });
    }
  });

  app.post('/api/softphone/profiles/:username/apply', auth, async (req, res) => {
    if (!(await canManage(req, dependencies))) return res.status(403).json({ error: 'Недостаточно прав' });
    const username = cleanUsername(req.params.username);
    const previewId = clean(req.body?.previewId, 64);
    const preview = previews.get(previewId);
    previews.delete(previewId);
    if (!preview || preview.expiresAt < Date.now() || preview.username !== username) return res.status(409).json({ error: 'Preview отсутствует или устарел' });
    try {
      const current = (await queryPBXPulsDb('SELECT password_encrypted,password_key_version FROM softphone_profiles WHERE username=? LIMIT 1', [username]))[0];
      let encryptedPassword = current?.password_encrypted || null;
      let keyVersion = current?.password_key_version || null;
      if (preview.input.authorizationPassword) {
        const encrypted = encryption.encrypt(preview.input.authorizationPassword);
        encryptedPassword = encrypted.ciphertext;
        keyVersion = encrypted.keyVersion;
      }
      await queryPBXPulsDb(`INSERT INTO softphone_profiles
        (username,extension,enabled,websocket_url,sip_uri,authorization_username,password_encrypted,password_key_version,display_name,updated_by)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE extension=VALUES(extension),enabled=VALUES(enabled),websocket_url=VALUES(websocket_url),sip_uri=VALUES(sip_uri),authorization_username=VALUES(authorization_username),password_encrypted=VALUES(password_encrypted),password_key_version=VALUES(password_key_version),display_name=VALUES(display_name),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
        [username, preview.input.extension || null, preview.input.enabled ? 1 : 0, preview.input.websocketUrl || null, preview.input.sipUri || null, preview.input.authorizationUsername || null, encryptedPassword, keyVersion, preview.input.displayName || null, preview.actor]);
      await queryPBXPulsDb('INSERT INTO softphone_profile_audit(username,actor,event_type,details_json) VALUES(?,?,?,?)', [username, preview.actor, 'profile_applied', JSON.stringify({ enabled: preview.input.enabled, extension: preview.input.extension, passwordChanged: Boolean(preview.input.authorizationPassword) })]);
      return res.json({ success: true, username });
    } catch {
      return res.status(500).json({ error: 'Не удалось сохранить WebRTC-профиль' });
    }
  });
}
