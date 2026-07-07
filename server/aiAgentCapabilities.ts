import { execFile } from 'child_process';

export type AiAgentCapabilityId =
  | 'diagnose_trunk'
  | 'diagnose_extension'
  | 'diagnose_rtp'
  | 'diagnose_calls'
  | 'diagnose_network'
  | 'diagnose_ami'
  | 'answer_only';

export interface AiCapabilityCommand {
  title: string;
  cmd: string;
  args: string[];
  timeoutMs?: number;
}

export interface AiCapabilityResult {
  title: string;
  command: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error: string | null;
}

const COMMAND_TIMEOUT_MS = 10000;
const MAX_STDOUT = 20000;
const MAX_STDERR = 4000;

export function maskSensitiveText(text: string): string {
  if (!text) return '';
  let masked = String(text);
  masked = masked.replace(/(secret\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(password\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(passwd\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(token\s*=\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(api[_-]?key\s*[:=]\s*)([^\s\r\n;]+)/gi, '$1********');
  masked = masked.replace(/(authorization:\s*bearer\s+)([^\s\r\n]+)/gi, '$1********');
  masked = masked.replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '********');
  return masked;
}

export function getCapabilityCommands(capability: AiAgentCapabilityId): AiCapabilityCommand[] {
  const commands: Record<AiAgentCapabilityId, AiCapabilityCommand[]> = {
    diagnose_trunk: [
      { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
      { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] },
      { title: 'Chan SIP settings', cmd: 'asterisk', args: ['-rx', 'sip show settings'] },
      { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
      { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
      { title: 'PJSIP contacts', cmd: 'asterisk', args: ['-rx', 'pjsip show contacts'] },
      { title: 'RTP settings', cmd: 'asterisk', args: ['-rx', 'rtp show settings'] }
    ],
    diagnose_extension: [
      { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
      { title: 'PJSIP contacts', cmd: 'asterisk', args: ['-rx', 'pjsip show contacts'] },
      { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] },
      { title: 'Active channels', cmd: 'asterisk', args: ['-rx', 'core show channels concise'] }
    ],
    diagnose_rtp: [
      { title: 'RTP settings', cmd: 'asterisk', args: ['-rx', 'rtp show settings'] },
      { title: 'Chan SIP settings', cmd: 'asterisk', args: ['-rx', 'sip show settings'] },
      { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
      { title: 'Codecs', cmd: 'asterisk', args: ['-rx', 'core show codecs'] },
      { title: 'Translations', cmd: 'asterisk', args: ['-rx', 'core show translation'] }
    ],
    diagnose_calls: [
      { title: 'Active channels', cmd: 'asterisk', args: ['-rx', 'core show channels concise'] },
      { title: 'Queues', cmd: 'asterisk', args: ['-rx', 'queue show'] },
      { title: 'Chan SIP channels', cmd: 'asterisk', args: ['-rx', 'sip show channels'] },
      { title: 'PJSIP channels', cmd: 'asterisk', args: ['-rx', 'pjsip show channels'] }
    ],
    diagnose_network: [
      { title: 'IP routes', cmd: 'ip', args: ['route', 'show'] },
      { title: 'IP addresses', cmd: 'ip', args: ['address', 'show'] }
    ],
    diagnose_ami: [
      { title: 'AMI settings', cmd: 'asterisk', args: ['-rx', 'manager show settings'] }
    ],
    answer_only: []
  };

  return commands[capability] || [];
}

export function getAllowedDiagnosticCommandSuggestions(): Array<{ command: string; description: string }> {
  const capabilities: AiAgentCapabilityId[] = [
    "diagnose_trunk",
    "diagnose_extension",
    "diagnose_rtp",
    "diagnose_calls",
    "diagnose_network",
    "diagnose_ami"
  ];

  const byCommand = new Map<string, { command: string; description: string }>();

  for (const capability of capabilities) {
    for (const item of getCapabilityCommands(capability)) {
      const command = formatCommand(item);
      if (!byCommand.has(command)) {
        byCommand.set(command, { command, description: item.title });
      }
    }
  }

  return Array.from(byCommand.values());
}

export function findAllowedDiagnosticCommand(command: string): AiCapabilityCommand | null {
  const normalized = String(command || '').trim();
  const allCommands = Array.from(new Set(
    (Object.keys({
      diagnose_trunk: true,
      diagnose_extension: true,
      diagnose_rtp: true,
      diagnose_calls: true,
      diagnose_network: true,
      diagnose_ami: true
    }) as AiAgentCapabilityId[])
      .flatMap(getCapabilityCommands)
      .map(item => JSON.stringify(item))
  )).map(item => JSON.parse(item) as AiCapabilityCommand);

  return allCommands.find(item => formatCommand(item) === normalized) || null;
}

export function formatCommand(command: AiCapabilityCommand): string {
  return [command.cmd, ...command.args.map(arg => /\s/.test(arg) ? `"${arg}"` : arg)].join(' ');
}

export async function executeCapability(capability: AiAgentCapabilityId): Promise<AiCapabilityResult[]> {
  const commands = getCapabilityCommands(capability);
  const results: AiCapabilityResult[] = [];

  for (const command of commands) {
    results.push(await executeReadOnlyCommand(command));
  }

  return results;
}

export function executeReadOnlyCommand(command: AiCapabilityCommand): Promise<AiCapabilityResult> {
  return new Promise((resolve) => {
    execFile(command.cmd, command.args, {
      timeout: command.timeoutMs || COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      resolve({
        title: command.title,
        command: formatCommand(command),
        ok: !error,
        stdout: maskSensitiveText(String(stdout || '')).slice(0, MAX_STDOUT),
        stderr: maskSensitiveText(String(stderr || '')).slice(0, MAX_STDERR),
        error: error ? maskSensitiveText(String(error.message || error)).slice(0, 1200) : null
      });
    });
  });
}

export function formatCapabilityResultsForAi(results: AiCapabilityResult[]): string {
  return results.map(result => [
    '### ' + result.title,
    '$ ' + result.command,
    'OK: ' + result.ok,
    result.error ? 'ERROR: ' + result.error : '',
    result.stderr ? 'STDERR:\n' + result.stderr : '',
    'STDOUT:\n' + (result.stdout || 'пусто')
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');
}
