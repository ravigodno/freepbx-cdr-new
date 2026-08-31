export type SoftphoneAutoConfigCheck = {
  key: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
};

export type SoftphoneAutoConfigSource = {
  username: string;
  extension: string;
  displayName: string;
  pbxHost: string;
  websocketUrl?: string;
  deviceTech: string;
  pjsip: Record<string, string>;
};

export type SoftphoneAutoConfigResult = {
  ready: boolean;
  checks: SoftphoneAutoConfigCheck[];
  profile: {
    enabled: boolean;
    extension: string;
    websocketUrl: string;
    sipUri: string;
    authorizationUsername: string;
    authorizationPassword: string;
    replacePassword: boolean;
    displayName: string;
  };
};

const clean = (value: unknown, max = 255) => String(value || '').trim().slice(0, max);
const enabled = (value: unknown) => ['1', 'yes', 'true', 'on'].includes(clean(value).toLowerCase());

export function resolveSoftphonePbxHost(input: {
  configuredHost?: unknown;
  apiUrl?: unknown;
  requestHost?: unknown;
}): string {
  const configuredHost = normalizeHost(input.configuredHost);
  if (configuredHost) return configuredHost;

  try {
    const apiHost = normalizeHost(new URL(clean(input.apiUrl, 500)).hostname);
    if (apiHost && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(apiHost)) return apiHost;
  } catch {}

  return normalizeHost(input.requestHost);
}

function normalizeHost(value: unknown): string {
  const raw = clean(value, 253).replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!raw || !/^[a-z0-9.:[\]-]+$/i.test(raw)) return '';
  return raw.includes(':') && !raw.startsWith('[') ? `[${raw}]` : raw;
}

function normalizeWebsocketUrl(value: unknown, host: string): string {
  const configured = clean(value, 500);
  if (configured) return /^wss:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(configured) ? configured : '';
  return host ? `wss://${host}:8089/ws` : '';
}

export function buildSoftphoneAutoConfig(source: SoftphoneAutoConfigSource): SoftphoneAutoConfigResult {
  const extension = clean(source.extension, 32);
  const host = normalizeHost(source.pbxHost);
  const websocketUrl = normalizeWebsocketUrl(source.websocketUrl, host);
  const pjsip = Object.fromEntries(Object.entries(source.pjsip || {}).map(([key, value]) => [key.toLowerCase(), clean(value, 500)]));
  const checks: SoftphoneAutoConfigCheck[] = [];

  checks.push(/^[0-9*#+]{1,32}$/.test(extension)
    ? { key: 'extension', status: 'ok', message: `Внутренний номер ${extension} назначен пользователю` }
    : { key: 'extension', status: 'error', message: 'Пользователю не назначен корректный внутренний номер' });
  checks.push(clean(source.deviceTech).toLowerCase() === 'pjsip'
    ? { key: 'technology', status: 'ok', message: 'Endpoint использует PJSIP' }
    : { key: 'technology', status: 'error', message: 'Для браузерной гарнитуры требуется PJSIP endpoint' });
  checks.push(websocketUrl
    ? { key: 'wss', status: 'ok', message: `WSS будет использовать ${websocketUrl}` }
    : { key: 'wss', status: 'error', message: 'Не удалось безопасно определить WSS URL АТС' });

  const webRtcFlag = enabled(pjsip.webrtc);
  const requiredFlags = [
    ['avpf', 'AVPF'],
    ['icesupport', 'ICE'],
    ['rtcp_mux', 'RTCP mux']
  ] as const;
  for (const [key, label] of requiredFlags) {
    checks.push(webRtcFlag || enabled(pjsip[key])
      ? { key, status: 'ok', message: `${label} включён` }
      : { key, status: 'error', message: `${label} не включён для endpoint ${extension || '—'}` });
  }
  const mediaEncryption = clean(pjsip.media_encryption || pjsip.encryption).toLowerCase();
  checks.push(webRtcFlag || mediaEncryption === 'dtls'
    ? { key: 'dtls', status: 'ok', message: 'DTLS-SRTP включён' }
    : { key: 'dtls', status: 'error', message: 'Для WebRTC требуется DTLS-SRTP' });

  // A FreePBX endpoint may contain unrelated `username` metadata (for example a
  // trunk caller identity). The assigned extension is the authoritative auth
  // username for the endpoint selected above.
  const authorizationUsername = extension;
  const authorizationPassword = String(pjsip.secret || pjsip.password || '');
  checks.push(authorizationPassword
    ? { key: 'secret', status: 'ok', message: 'SIP-секрет найден и останется только на backend' }
    : { key: 'secret', status: 'error', message: 'SIP-секрет endpoint не найден; автоматическое сохранение заблокировано' });

  const ready = checks.every(check => check.status !== 'error');
  return {
    ready,
    checks,
    profile: {
      enabled: ready,
      extension,
      websocketUrl,
      sipUri: extension && host ? `sip:${extension}@${host.replace(/^\[|\]$/g, '')}` : '',
      authorizationUsername,
      authorizationPassword,
      replacePassword: Boolean(authorizationPassword),
      displayName: clean(source.displayName || source.username, 191)
    }
  };
}
