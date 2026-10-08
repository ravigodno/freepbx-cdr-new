import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run = promisify(execFile);

export type DeviceInspection = { ok: boolean; ready: boolean; extension: string; device: string; exists: boolean; checks: string[]; digest: string; module: string | null; created?: boolean; secret?: string };
export class SoftphoneDeviceProvisioning {
  async command(action: 'inspect' | 'apply' | 'rollback', extension: string, digest = ''): Promise<DeviceInspection> {
    if (!/^[0-9]{1,8}$/.test(extension)) throw Error('Нужен цифровой внутренний PJSIP-номер');
    try {
      const { stdout } = await run('php', [path.join(process.cwd(), 'scripts/freepbx-softphone-device.php'), action, extension, digest], { timeout: 30000, maxBuffer: 128 * 1024 });
      const result = JSON.parse(stdout);
      if (!result.ok) throw Error('provider_failed');
      return result;
    } catch {
      // Never return helper stdout/stderr: apply may contain a SIP secret.
      throw Error('Не удалось настроить устройство FreePBX. Повторите проверку; при конфликте обратитесь к администратору.');
    }
  }
  async reloadAndVerify(device: string) {
    if (!/^[0-9]{3,10}$/.test(device)) throw Error('Некорректное устройство');
    try {
      await run('fwconsole', ['reload'], { timeout: 120000, maxBuffer: 1024 * 1024 });
      const { stdout } = await run('asterisk', ['-rx', `pjsip show endpoint ${device}`], { timeout: 10000, maxBuffer: 256 * 1024 });
      for (const pattern of [/ice_support\s*:\s*true/i, /use_avpf\s*:\s*true/i, /rtcp_mux\s*:\s*true/i, /media_encryption\s*:\s*dtls/i]) if (!pattern.test(stdout)) throw Error('not_ready');
    } catch { throw Error('WebRTC-устройство не прошло проверку загруженной конфигурации АТС'); }
  }
  async reload() {
    try { await run('fwconsole', ['reload'], { timeout: 120000, maxBuffer: 1024 * 1024 }); }
    catch { throw Error('Не удалось перечитать конфигурацию АТС'); }
  }
}
