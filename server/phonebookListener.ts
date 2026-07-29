import http, { type RequestListener, type Server } from 'node:http';
import os from 'node:os';

type Network = { cidr: string; network: number; mask: number };

const cleanAddress = (value: unknown) => String(value || '').trim().replace(/^::ffff:/i, '');
const ipv4ToInt = (value: string): number | null => {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(part => Number(part));
  if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
};
const intToIpv4 = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255
].join('.');
const prefixMask = (prefix: number) => prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
const netmaskPrefix = (netmask: string): number | null => {
  const value = ipv4ToInt(netmask);
  if (value === null) return null;
  let seenZero = false;
  let prefix = 0;
  for (let bit = 31; bit >= 0; bit--) {
    const enabled = ((value >>> bit) & 1) === 1;
    if (seenZero && enabled) return null;
    if (enabled) prefix++;
    else seenZero = true;
  }
  return prefix;
};
const parseNetwork = (value: string): Network | null => {
  const [address, prefixRaw] = cleanAddress(value).split('/');
  const ip = ipv4ToInt(address);
  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefixMask(prefix);
  const network = (ip & mask) >>> 0;
  return { cidr: `${intToIpv4(network)}/${prefix}`, network, mask };
};

export function discoverPhonebookAllowedCidrs(
  interfaces = os.networkInterfaces(),
  extraCidrs = process.env.PBXPULS_PHONEBOOK_ALLOWED_CIDRS || ''
): string[] {
  const discovered = Object.values(interfaces).flatMap(entries => entries || [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .map(entry => {
      const prefix = entry.cidr?.split('/')[1] || String(netmaskPrefix(entry.netmask));
      return parseNetwork(`${entry.address}/${prefix}`)?.cidr || '';
    });
  return Array.from(new Set([
    '127.0.0.0/8',
    ...discovered,
    ...extraCidrs.split(',').map(value => parseNetwork(value)?.cidr || '')
  ].filter(Boolean)));
}

export function isPhonebookClientAllowed(address: unknown, cidrs: string[]): boolean {
  const ip = ipv4ToInt(cleanAddress(address));
  if (ip === null) return false;
  return cidrs.some(value => {
    const network = parseNetwork(value);
    return network ? ((ip & network.mask) >>> 0) === network.network : false;
  });
}

export function createPhonebookOnlyHandler(
  app: RequestListener,
  allowedCidrs = discoverPhonebookAllowedCidrs()
): RequestListener {
  return (req, res) => {
    const pathname = new URL(req.url || '/', 'http://pbxpuls.local').pathname;
    if (!pathname.startsWith('/phonebook/')) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }
    if (!isPhonebookClientAllowed(req.socket.remoteAddress, allowedCidrs)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }
    app(req, res);
  };
}

export function startPhonebookListener(app: RequestListener): Server | null {
  if (String(process.env.PBXPULS_PHONEBOOK_LISTENER_DISABLED || '').toLowerCase() === 'true') return null;
  const port = Number(process.env.PBXPULS_PHONEBOOK_PORT || 3001);
  const host = process.env.PBXPULS_PHONEBOOK_HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn('[PHONEBOOK] listener disabled: invalid PBXPULS_PHONEBOOK_PORT');
    return null;
  }
  const allowedCidrs = discoverPhonebookAllowedCidrs();
  const server = http.createServer(createPhonebookOnlyHandler(app, allowedCidrs));
  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[PHONEBOOK] port ${port} already in use; keeping the existing listener`);
      return;
    }
    console.error('[PHONEBOOK] listener error:', error.code || error.message);
  });
  server.listen(port, host, () => {
    console.log(`[PHONEBOOK] isolated listener active on ${host}:${port}; allowed CIDRs: ${allowedCidrs.join(', ')}`);
  });
  return server;
}

export function stopPhonebookListener(server: Server | null): Promise<void> {
  if (!server?.listening) return Promise.resolve();
  return new Promise(resolve => server.close(() => resolve()));
}
