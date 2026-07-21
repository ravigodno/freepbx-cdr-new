import crypto from 'node:crypto';
import type { SipCaptureEvent } from './sipCaptureParser.js';

export const SIP_CAPTURE_LIMITS = {
  minDurationSeconds: 5,
  maxDurationSeconds: 300,
  maxPcapBytes: 32 * 1024 * 1024,
  maxPackets: 50_000,
  maxDialogs: 500,
  maxMessagesPerPage: 200,
  sessionTtlMs: 15 * 60 * 1000
} as const;

export function redactSipSecrets(value: string): string {
  return String(value || '')
    .replace(/^(Authorization|Proxy-Authorization)\s*:\s*.*$/gim, '$1: ***')
    .replace(/\b(nonce|response|password|passwd|secret|token)\s*=\s*(?:"[^"]*"|[^,;\s]+)/gi, '$1=***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1***');
}

export function validateCaptureHost(value: unknown): string {
  const host = String(value || '').trim();
  if (!host) return '';
  if (!/^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)$/i.test(host)) throw new Error('Некорректный IP host');
  if (host.includes('.')) {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) throw new Error('Некорректный IPv4 host');
  }
  return host;
}

export function validateCapturePort(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный SIP-порт');
  return port;
}

export function buildSafeSipBpf(ports: number[], host?: string): string {
  const safePorts = [...new Set(ports)].filter(port => Number.isInteger(port) && port > 0 && port <= 65535);
  if (!safePorts.length) throw new Error('Не указаны разрешённые SIP-порты');
  const transport = `(udp or tcp) and (${safePorts.map(port => `port ${port}`).join(' or ')})`;
  return host ? `${transport} and host ${validateCaptureHost(host)}` : transport;
}

export type SipDialog = {
  id: string;
  callId: string;
  startedAt: string;
  lastMessageAt: string;
  from: string;
  to: string;
  requestUri: string;
  source: string;
  destination: string;
  transport: string;
  userAgent: string;
  finalCode: number | null;
  state: 'INVITE sent' | 'Trying' | 'Ringing' | 'Answered' | 'Cancelled' | 'Rejected' | 'Failed' | 'Completed' | 'Incomplete';
  messageCount: number;
  retransmissions: number;
  durationMs: number;
  codecs: string[];
  rtpEndpoints: string[];
  reason: string;
};

export function buildSipDialogs(events: SipCaptureEvent[]): SipDialog[] {
  const groups = new Map<string, SipCaptureEvent[]>();
  for (const event of events) {
    const key = event.callId || `unidentified:${event.srcIp}:${event.srcPort}:${event.dstIp}:${event.dstPort}`;
    const group = groups.get(key) || [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([callId, unsorted]) => {
    const items = [...unsorted].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const first = items[0];
    const last = items.at(-1)!;
    const codes = items.map(item => item.code).filter(Boolean);
    const finalCode = [...codes].reverse().find(code => code >= 200) || null;
    const methods = items.map(item => item.requestMethod || item.method.split(' ')[0].toUpperCase());
    let state: SipDialog['state'] = 'Incomplete';
    if (methods.includes('BYE')) state = 'Completed';
    else if (methods.includes('CANCEL') || finalCode === 487) state = 'Cancelled';
    else if (finalCode && finalCode >= 500) state = 'Failed';
    else if (finalCode && finalCode >= 400) state = 'Rejected';
    else if (codes.some(code => code >= 200 && code < 300)) state = 'Answered';
    else if (codes.includes(180) || codes.includes(183)) state = 'Ringing';
    else if (codes.includes(100)) state = 'Trying';
    else if (methods.includes('INVITE')) state = 'INVITE sent';
    const signatures = new Set<string>();
    let retransmissions = 0;
    for (const item of items) {
      const signature = `${item.srcIp}:${item.srcPort}|${item.dstIp}:${item.dstPort}|${item.cseq}|${item.method}`;
      if (signatures.has(signature)) retransmissions += 1;
      signatures.add(signature);
    }
    return {
      id: crypto.createHash('sha1').update(callId).digest('hex'), callId,
      startedAt: first.capturedAt, lastMessageAt: last.capturedAt,
      from: first.from || '—', to: first.to || '—', requestUri: first.requestUri || '—',
      source: `${first.srcIp}:${first.srcPort}`, destination: `${first.dstIp}:${first.dstPort}`,
      transport: first.transport.toUpperCase(), userAgent: items.find(item => item.userAgent && item.userAgent !== 'Unknown')?.userAgent || '—',
      finalCode, state, messageCount: items.length, retransmissions,
      durationMs: Math.max(0, Date.parse(last.capturedAt) - Date.parse(first.capturedAt)),
      codecs: [...new Set(items.flatMap(item => item.codecs || []))],
      rtpEndpoints: [...new Set(items.flatMap(item => item.rtpEndpoints || []))],
      reason: items.find(item => item.reason)?.reason || ''
    };
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
