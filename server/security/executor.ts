import { execFile } from 'child_process';
import type { SecurityCommandResult } from './types.js';
import { maskSecuritySecrets } from './sanitize.js';

const ALLOWED_COMMANDS = new Set([
  'ss', 'netstat', 'nft', 'iptables', 'ip6tables', 'firewall-cmd', 'ufw', 'fail2ban-client',
  'systemctl', 'service', 'journalctl', 'uname', 'getenforce', 'aa-status', 'openssl', 'ip', 'fwconsole', 'asterisk'
]);
const MAX_OUTPUT = 512 * 1024;

function validArgument(arg: string): boolean {
  return typeof arg === 'string' && arg.length <= 512 && !/[\r\n\0]/.test(arg);
}

export async function runSecurityCommand(command: string, args: string[] = [], timeoutMs = 5000): Promise<SecurityCommandResult> {
  const basename = String(command || '').split('/').pop() || '';
  if (!ALLOWED_COMMANDS.has(basename) || !args.every(validArgument)) throw new Error('Security command is not allowlisted');
  const started = Date.now();
  return new Promise(resolve => {
    execFile(command, args, { timeout: Math.max(500, Math.min(timeoutMs, 15000)), maxBuffer: MAX_OUTPUT, encoding: 'utf8' }, (error: any, stdout, stderr) => {
      const unavailable = error?.code === 'ENOENT';
      resolve({
        ok: !error, command: basename,
        stdout: maskSecuritySecrets(stdout, MAX_OUTPUT), stderr: maskSecuritySecrets(stderr || error?.message || '', 4000),
        exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
        timedOut: Boolean(error?.killed || error?.signal === 'SIGTERM'), unavailable, durationMs: Date.now() - started
      });
    });
  });
}

export async function runFail2BanAction(action: 'banip' | 'unbanip', jail: string, ip: string): Promise<SecurityCommandResult> {
  return runSecurityCommand('fail2ban-client', ['set', jail, action, ip], 8000);
}
