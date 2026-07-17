import crypto from 'crypto';

export const SIP_METHODS = ['INVITE', 'ACK', 'BYE', 'CANCEL', 'REGISTER', 'OPTIONS', 'REFER', 'NOTIFY', 'SUBSCRIBE', 'INFO', 'UPDATE', 'PRACK', 'MESSAGE', 'PUBLISH'];

export type SipCaptureEvent = {
  id: string; time: string; capturedAt: string; srcIp: string; srcPort: number; dstIp: string; dstPort: number;
  direction: string; method: string; phone: string; callId: string; userAgent: string; code: number;
  status: 'Nominal' | 'Warning' | 'Critical'; seq: number; transport: 'udp' | 'tcp';
};

type PacketResult = { candidate: boolean; tls: boolean; events: SipCaptureEvent[]; error?: string };

function endpoint(value: string) {
  const clean = value.replace(/:$/, '');
  const ipv4 = clean.match(/^(\d+(?:\.\d+){3})\.(\d+)$/);
  if (ipv4) return { ip: ipv4[1], port: Number(ipv4[2]) };
  const ipv6 = clean.match(/^(.+)\.(\d+)$/);
  return { ip: ipv6?.[1] || clean, port: Number(ipv6?.[2] || 0) };
}

function header(text: string, long: string, compact?: string) {
  const names = [long, compact].filter(Boolean).join('|');
  return text.match(new RegExp(`^(?:${names})\\s*:\\s*(.+)$`, 'im'))?.[1]?.trim() || '';
}

export function parseTcpdumpPacket(packet: string, tlsPorts = new Set([5061])): PacketResult {
  const line = packet.split('\n', 1)[0] || '';
  const address = line.match(/\bIP6?\s+(\S+)\s+>\s+(\S+):/);
  if (!address) return { candidate: false, tls: false, events: [], error: 'Не распознан заголовок пакета tcpdump' };
  const src = endpoint(address[1]);
  const dst = endpoint(address[2]);
  const transport: 'udp' | 'tcp' = /\bUDP\b/i.test(line) ? 'udp' : 'tcp';
  const tls = tlsPorts.has(src.port) || tlsPorts.has(dst.port);
  const payload = packet.slice(packet.indexOf('\n') + 1);
  const startPattern = new RegExp(`(?:${SIP_METHODS.join('|')})\\s+\\S+\\s+SIP/2\\.0|SIP/2\\.0\\s+\\d{3}\\b`, 'ig');
  const starts = [...payload.matchAll(startPattern)];
  if (!starts.length) return { candidate: false, tls, events: [] };
  const events: SipCaptureEvent[] = [];
  starts.forEach((match, index) => {
    const text = payload.slice(match.index!, starts[index + 1]?.index ?? payload.length).replace(/\r/g, '');
    const first = text.split('\n')[0].trim();
    const request = first.match(new RegExp(`^(${SIP_METHODS.join('|')})\\s+sip:([^@;>\\s]+)`, 'i'));
    const response = first.match(/^SIP\/2\.0\s+(\d{3})\s*(.*)$/i);
    const cseq = header(text, 'CSeq');
    const callId = header(text, 'Call-ID', 'i');
    if (!request && !response) return;
    const code = response ? Number(response[1]) : 0;
    const method = request ? request[1].toUpperCase() : `${code} ${response?.[2] || 'Response'}`.trim();
    const seq = Number(cseq.match(/^(\d+)/)?.[1] || 0);
    const capturedAt = new Date().toISOString();
    events.push({
      id: crypto.createHash('sha1').update(`${capturedAt}|${src.ip}|${dst.ip}|${callId}|${cseq}|${first}`).digest('hex'),
      time: line.match(/\b(\d{2}:\d{2}:\d{2}\.\d+)/)?.[1] || capturedAt.slice(11, 23), capturedAt,
      srcIp: src.ip, srcPort: src.port, dstIp: dst.ip, dstPort: dst.port,
      direction: `${src.ip} → ${dst.ip}`, method, phone: request?.[2] || '—', callId,
      userAgent: header(text, 'User-Agent') || 'Unknown', code,
      status: code >= 500 ? 'Critical' : code >= 400 ? 'Warning' : 'Nominal', seq, transport
    });
  });
  return { candidate: true, tls, events, error: events.length ? undefined : 'SIP start-line найдена, но сообщение не разобрано' };
}

export class TcpdumpTextStreamParser {
  private buffer = '';
  constructor(private readonly onPacket: (result: PacketResult, bytes: number) => void, private readonly tlsPorts = new Set([5061])) {}
  push(chunk: string) {
    this.buffer += chunk;
    const marker = /(?=^\d{2}:\d{2}:\d{2}\.\d+\s+(?:\S+\s+(?:In|Out)\s+)?IP6?\s+)/gm;
    const positions = [...this.buffer.matchAll(marker)].map(match => match.index || 0);
    if (positions.length < 2) return;
    for (let index = 0; index < positions.length - 1; index++) {
      const packet = this.buffer.slice(positions[index], positions[index + 1]);
      this.onPacket(parseTcpdumpPacket(packet, this.tlsPorts), Buffer.byteLength(packet));
    }
    this.buffer = this.buffer.slice(positions[positions.length - 1]);
  }
  flush() {
    if (this.buffer.trim()) this.onPacket(parseTcpdumpPacket(this.buffer, this.tlsPorts), Buffer.byteLength(this.buffer));
    this.buffer = '';
  }
}
