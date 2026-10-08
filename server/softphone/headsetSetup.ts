import crypto from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { queryPBXPulsDb, withPBXPulsTransaction } from '../pbxpulsDb.js';
import { SoftphoneCredentialCrypto } from './credentialCrypto.js';
import { SoftphoneDeviceProvisioning, type DeviceInspection } from './deviceProvisioning.js';
import type { SoftphoneAutoConfigSource } from './autoConfig.js';

type Dependencies = {
  requireAuth: () => (req: Request, res: Response, next: NextFunction) => void;
  checkPermission: (req: Request, permission: string) => Promise<boolean>;
  resolveAutoConfigSource: (req: Request) => Promise<SoftphoneAutoConfigSource>;
};
const messages: Record<string, string> = {
  freepbx_ami_unavailable: 'FreePBX не подключён к AMI; проверьте его штатные настройки доступа',
  extension_missing: 'Пользователю нужен существующий внутренний номер', pjsip_required: 'Основной номер должен использовать PJSIP',
  pjsip_websocket_missing: 'В Asterisk не включён PJSIP WebSocket', default_certificate_missing: 'В Certificate Manager FreePBX нужен сертификат по умолчанию',
  companion_number_conflict: 'Номер браузерного устройства уже занят другим объектом', existing_companion_not_webrtc: 'Существующее браузерное устройство требует проверки администратора'
};
export function headsetPlanErrors(inspection: DeviceInspection, network: string, nativeHttps: boolean, encryptionReady: boolean) {
  const errors = inspection.checks.map(key => messages[key] || 'FreePBX не готов к автоматической настройке');
  if (!nativeHttps) errors.push('Сначала включите штатный HTTPS PBX Pulse');
  if (!encryptionReady) errors.push('Не настроено шифрование SIP-профилей');
  if (network !== 'lan') errors.push('Для подключения через Интернет сначала настройте VPN к сети АТС. Мастер не изменяет NAT и фаервол рабочего сервера.');
  return errors;
}

export function registerHeadsetSetupRoutes(app: Express, dependencies: Dependencies, services = {
  provider: new SoftphoneDeviceProvisioning(), encryption: new SoftphoneCredentialCrypto(),
  query: queryPBXPulsDb, transaction: withPBXPulsTransaction
}) {
  const { provider, encryption, query: queryPBXPulsDb, transaction: withPBXPulsTransaction } = services;
  const auth = dependencies.requireAuth();
  const allowed = async (req: Request) => ['admin', 'su'].includes(String((req as any).user?.role)) && await dependencies.checkPermission(req, 'make_calls');
  const username = (req: Request) => String((req as any).user?.username || '').trim().toLowerCase();
  const audit = (user: string, event: string, details: object) => queryPBXPulsDb('INSERT INTO softphone_profile_audit(username,actor,event_type,details_json) VALUES(?,?,?,?)', [user, user, event, JSON.stringify(details)]);

  app.post('/api/softphone/setup/preview', auth, async (req, res) => {
    if (!await allowed(req)) return res.status(403).json({ error: 'Первичную настройку устройства АТС выполняет администратор. После настройки пользователь подключает гарнитуру сам.' });
    try {
      const source = await dependencies.resolveAutoConfigSource(req);
      const inspection = await provider.command('inspect', source.extension);
      const errors = headsetPlanErrors(inspection, String(req.body?.network || 'lan'), process.env.PBXPULS_HTTPS_MODE === 'native' && process.env.PBXPULS_SOFTPHONE_LOCAL_PROXY !== 'false', encryption.ready());
      const host = req.hostname;
      const websocketUrl = `wss://${host}:${process.env.PBXPULS_HTTPS_PORT || '3000'}/softphone/ws`;
      if (source.pbxHost !== host) errors.push('Удалённая АТС требует отдельной настройки: локальный мастер доступен на сервере самой АТС.');
      const plan = { inspection, websocketUrl, sipUri: `sip:${inspection.device}@${host}`, displayName: source.displayName,
        changes: [inspection.exists ? `Использовать существующее устройство ${inspection.device}` : `Создать браузерное устройство ${inspection.device} для номера ${source.extension}`,
          'Включить WebRTC, ICE, AVPF, RTCP mux и DTLS для браузерного устройства',
          'Сохранить обычный телефон и пользовательский номер',
          'Применить конфигурацию FreePBX и проверить загруженное устройство',
          'Сохранить зашифрованный профиль гарнитуры и подключиться через HTTPS-порт PBX Pulse'] };
      const id = crypto.randomBytes(24).toString('hex');
      if (!errors.length) {
        await queryPBXPulsDb("DELETE FROM softphone_setup_previews WHERE status='pending' AND expires_at < UTC_TIMESTAMP()", []);
        await queryPBXPulsDb('INSERT INTO softphone_setup_previews(id,username,extension,plan_json,expires_at) VALUES(?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))', [id, username(req), source.extension, JSON.stringify(plan)]);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ready: !errors.length, previewId: errors.length ? null : id, extension: source.extension, device: inspection.device, changes: plan.changes, errors });
    } catch { return res.status(503).json({ error: 'Не удалось проверить локальный модуль WebRTC FreePBX. Изменения не применялись.' }); }
  });

  app.post('/api/softphone/setup/apply', auth, async (req, res) => {
    if (!await allowed(req)) return res.status(403).json({ error: 'Для настройки устройства АТС нужны права администратора' });
    if (req.body?.confirm !== true || !/^[a-f0-9]{48}$/.test(String(req.body?.previewId || ''))) return res.status(400).json({ error: 'Подтвердите показанные изменения' });
    const user = username(req);
    const id = req.body.previewId;
    let plan: any;
    let device: DeviceInspection | undefined;
    let committed = false;
    let provisioningStarted = false;
    try {
      const source = await dependencies.resolveAutoConfigSource(req);
      plan = await withPBXPulsTransaction(async connection => {
        const [rows] = await connection.execute("SELECT * FROM softphone_setup_previews WHERE id=? AND username=? AND status='pending' AND expires_at>UTC_TIMESTAMP() FOR UPDATE", [id, user]);
        const row = (rows as any[])[0];
        if (!row || row.extension !== source.extension) throw Error('preview_stale');
        const [active] = await connection.execute("SELECT id FROM softphone_setup_previews WHERE username=? AND status='applying' FOR UPDATE", [user]);
        if ((active as any[]).length) throw Error('setup_busy');
        await connection.execute("UPDATE softphone_setup_previews SET status='applying' WHERE id=?", [id]);
        return JSON.parse(row.plan_json);
      });
      if (!encryption.ready()) throw Error('encryption_unavailable');
      await audit(user, 'headset_setup_started', { previewId: id, device: plan.inspection.device, extension: source.extension });
      provisioningStarted = true;
      device = await provider.command('apply', source.extension, plan.inspection.digest);
      await provider.reloadAndVerify(device.device);
      if (!device.secret) throw Error('secret_missing');
      const encrypted = encryption.encrypt(device.secret);
      delete device.secret;
      await withPBXPulsTransaction(async connection => {
        await connection.execute(`INSERT INTO softphone_profiles(username,extension,enabled,websocket_url,sip_uri,authorization_username,password_encrypted,password_key_version,display_name,updated_by)
          VALUES(?,?,1,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE extension=VALUES(extension),enabled=1,websocket_url=VALUES(websocket_url),sip_uri=VALUES(sip_uri),authorization_username=VALUES(authorization_username),password_encrypted=VALUES(password_encrypted),password_key_version=VALUES(password_key_version),display_name=VALUES(display_name),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP()`,
          [user, source.extension, plan.websocketUrl, plan.sipUri, device!.device, encrypted.ciphertext, encrypted.keyVersion, plan.displayName, user]);
        await connection.execute("UPDATE softphone_setup_previews SET status='applied' WHERE id=?", [id]);
        await connection.execute('INSERT INTO softphone_profile_audit(username,actor,event_type,details_json) VALUES(?,?,?,?)', [user, user, 'headset_setup_applied', JSON.stringify({ previewId: id, device: device!.device, extension: source.extension, created: device!.created })]);
      });
      committed = true;
      return res.json({ success: true, extension: source.extension, device: device.device });
    } catch {
      let rolledBack = false;
      if (device?.created && !committed) {
        try { await provider.command('rollback', plan.inspection.extension, device.digest); await provider.reload(); rolledBack = true; } catch {}
      }
      const needsReview = (provisioningStarted && !device) || (!!device?.created && !rolledBack);
      if (plan) {
        await queryPBXPulsDb("UPDATE softphone_setup_previews SET status=? WHERE id=?", [needsReview ? 'needs_review' : 'failed', id]).catch(() => undefined);
        await audit(user, 'headset_setup_failed', { previewId: id, device: plan.inspection.device, rolledBack, needsReview }).catch(() => undefined);
      }
      return res.status(409).json({ error: needsReview ? 'Настройка не завершена. Требуется проверка устройства администратором; автоматический откат не подтверждён.' : 'Настройка не завершена. Повторите проверку. Если новое устройство было создано, оно удалено; прежний профиль сохранён.' });
    }
  });
}
