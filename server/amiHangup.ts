import net from 'node:net';

export type AmiHangupSettings = {
  amiHost?: string;
  amiPort?: number | string;
  amiUser?: string;
  amiPass?: string;
};

export type AmiHangupResult = {
  channel: string;
  success: boolean;
  message: string;
};

const SAFE_CHANNEL = /^[A-Za-z0-9_@;:/.+\-]+$/;

function hangupOne(settings: AmiHangupSettings, channel: string): Promise<AmiHangupResult> {
  return new Promise(resolve => {
    if (!SAFE_CHANNEL.test(channel)) {
      resolve({ channel, success: false, message: 'invalid_channel' });
      return;
    }
    const host = String(settings.amiHost || 'localhost');
    const port = Number(settings.amiPort || 5038);
    const username = String(settings.amiUser || '');
    const secret = String(settings.amiPass || '');
    if (!host || !username || !secret) {
      resolve({ channel, success: false, message: 'ami_not_configured' });
      return;
    }

    const socket = net.createConnection({ host, port });
    socket.setTimeout(5000);
    let buffer = '';
    let stage: 'greeting' | 'login' | 'hangup' | 'done' = 'greeting';
    let settled = false;
    const finish = (success: boolean, message: string) => {
      if (settled) return;
      settled = true;
      stage = 'done';
      try { socket.write('Action: Logoff\r\n\r\n'); } catch {}
      socket.destroy();
      resolve({ channel, success, message: message.slice(0, 300) });
    };

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (stage === 'greeting' && buffer.includes('\n')) {
        buffer = '';
        stage = 'login';
        socket.write(`Action: Login\r\nUsername: ${username}\r\nSecret: ${secret}\r\nEvents: off\r\n\r\n`);
        return;
      }
      if ((stage === 'login' || stage === 'hangup') && !/(?:\r\n\r\n|\n\n)/.test(buffer)) return;
      if (stage === 'login') {
        if (!/Response:\s*Success/i.test(buffer)) return finish(false, 'ami_login_failed');
        buffer = '';
        stage = 'hangup';
        socket.write(`Action: Hangup\r\nChannel: ${channel}\r\nCause: 21\r\n\r\n`);
        return;
      }
      if (stage === 'hangup') {
        const success = /Response:\s*Success/i.test(buffer);
        finish(success, success ? 'hangup_requested' : (buffer.match(/Message:\s*([^\r\n]+)/i)?.[1] || 'hangup_failed'));
      }
    });
    socket.on('timeout', () => finish(false, 'ami_hangup_timeout'));
    socket.on('error', error => finish(false, error.message || 'ami_hangup_error'));
    socket.on('close', () => {
      if (!settled) finish(false, 'ami_connection_closed');
    });
  });
}

export async function runAmiHangupChannels(settings: AmiHangupSettings, channels: string[]): Promise<AmiHangupResult[]> {
  const unique = Array.from(new Set(channels.map(channel => String(channel || '').trim()).filter(Boolean)));
  return Promise.all(unique.map(channel => hangupOne(settings, channel)));
}
