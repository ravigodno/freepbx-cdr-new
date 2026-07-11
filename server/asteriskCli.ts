import fs from 'fs';
import { execFile, spawnSync } from 'child_process';

export type AsteriskCliPathSource = 'env' | 'path' | 'debian_fallback' | 'centos_fallback' | 'generic_fallback' | null;

export interface AsteriskCliDiagnostics {
  osId: string;
  osLike: string[];
  isDebianLike: boolean;
  isCentosLike: boolean;
  freePbxDetected: boolean;
  asteriskEnvironmentDetected: boolean;
  asteriskCliAvailable: boolean;
  asteriskCliPath: string | null;
  checkedPaths: string[];
  pathSource: AsteriskCliPathSource;
}

export interface AsteriskCliResult {
  success: boolean;
  message: string;
  warning?: string;
  timedOut?: boolean;
  diagnostics: AsteriskCliDiagnostics;
}

const STANDARD_PATHS = [
  '/usr/sbin/asterisk',
  '/sbin/asterisk',
  '/usr/local/sbin/asterisk',
  '/usr/bin/asterisk',
  '/bin/asterisk'
];

function parseOsRelease(): { osId: string; osLike: string[] } {
  try {
    const values: Record<string, string> = {};
    for (const line of fs.readFileSync('/etc/os-release', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim().toLowerCase();
    }
    return {
      osId: values.ID || 'unknown',
      osLike: (values.ID_LIKE || '').split(/\s+/).filter(Boolean)
    };
  } catch {
    return { osId: 'unknown', osLike: [] };
  }
}

function isExecutable(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function findOnPath(): string | null {
  const result = spawnSync('/bin/sh', ['-c', 'command -v asterisk'], {
    encoding: 'utf8',
    timeout: 2000
  });
  const candidate = String(result.stdout || '').trim().split(/\r?\n/)[0];
  return candidate && isExecutable(candidate) ? candidate : null;
}

export function resolveAsteriskCli(): AsteriskCliDiagnostics {
  const { osId, osLike } = parseOsRelease();
  const osTokens = new Set([osId, ...osLike]);
  const isDebianLike = osTokens.has('debian') || osTokens.has('ubuntu');
  const isCentosLike = ['centos', 'rhel', 'fedora', 'rocky', 'almalinux', 'sangoma'].some(id => osTokens.has(id));
  const checkedPaths: string[] = [];
  const base = {
    osId,
    osLike,
    isDebianLike,
    isCentosLike,
    freePbxDetected: fs.existsSync('/etc/freepbx.conf') || fs.existsSync('/var/www/html/admin/modules/framework'),
    asteriskEnvironmentDetected: fs.existsSync('/etc/asterisk') || fs.existsSync('/var/run/asterisk')
  };

  const envPath = String(process.env.ASTERISK_BIN || '').trim();
  if (envPath) {
    checkedPaths.push(envPath);
    if (isExecutable(envPath)) return { ...base, asteriskCliAvailable: true, asteriskCliPath: envPath, checkedPaths, pathSource: 'env' };
  }

  const pathCandidate = findOnPath();
  if (pathCandidate) {
    checkedPaths.push(pathCandidate);
    return { ...base, asteriskCliAvailable: true, asteriskCliPath: pathCandidate, checkedPaths, pathSource: 'path' };
  }

  const fallbackSource: Exclude<AsteriskCliPathSource, 'env' | 'path' | null> = isDebianLike
    ? 'debian_fallback'
    : isCentosLike ? 'centos_fallback' : 'generic_fallback';
  for (const candidate of STANDARD_PATHS) {
    if (!checkedPaths.includes(candidate)) checkedPaths.push(candidate);
    if (isExecutable(candidate)) {
      return { ...base, asteriskCliAvailable: true, asteriskCliPath: candidate, checkedPaths, pathSource: fallbackSource };
    }
  }

  return { ...base, asteriskCliAvailable: false, asteriskCliPath: null, checkedPaths, pathSource: null };
}

export function runAsteriskCliCommand(command: string, timeoutMs = 5000): Promise<AsteriskCliResult> {
  const diagnostics = resolveAsteriskCli();
  if (!diagnostics.asteriskCliPath) {
    return Promise.resolve({
      success: false,
      message: 'Asterisk CLI не найден',
      warning: 'Asterisk CLI не найден. Укажите ASTERISK_BIN=/usr/sbin/asterisk или проверьте установку Asterisk.',
      diagnostics
    });
  }

  return new Promise(resolve => {
    execFile(diagnostics.asteriskCliPath as string, ['-rx', command], {
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024
    }, (error, stdout, stderr) => {
      const message = String(stderr || stdout || error?.message || '');
      const timedOut = Boolean(error && (error as NodeJS.ErrnoException & { killed?: boolean }).killed);
      resolve({
        success: !error,
        message,
        warning: error ? (timedOut ? `Asterisk CLI timeout (${timeoutMs} ms): ${command}` : `Asterisk CLI command failed: ${command}`) : undefined,
        timedOut,
        diagnostics
      });
    });
  });
}
