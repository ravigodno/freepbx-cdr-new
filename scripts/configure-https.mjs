#!/usr/bin/env node
// Deployment configuration only; no application/business data is stored here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const app = process.cwd();
const envPath = path.join(app, '.env');
const original = fs.readFileSync(envPath, 'utf8');
const env = { ...dotenv.parse(original), ...process.env };
const apply = process.argv.includes('--apply');
const tlsDir = env.PBXPULS_TLS_DIR || '/etc/pbxpuls/tls';
const mode = env.PBXPULS_HTTPS_MODE || 'native';
if (!['native', 'external', 'off'].includes(mode)) throw Error('Invalid PBXPULS_HTTPS_MODE');
if (mode !== 'native') { console.log(`HTTPS mode ${mode}: existing deployment retained.`); process.exit(0); }
const port = (s, fallback) => {
  const n = Number(s || fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw Error('Invalid web port');
  return n;
};
const httpsPort = port(env.PBXPULS_HTTPS_PORT, 3000);
const httpPort = port(env.PBXPULS_HTTPS_MODE === 'native' ? env.PORT : env.PBXPULS_INTERNAL_HTTP_PORT, 3002);
const httpDisabled = env.PBXPULS_HTTP_DISABLED === 'true';
if (!httpDisabled && httpPort === httpsPort) throw Error('HTTP and HTTPS need separate ports');
const cert = env.PBXPULS_TLS_CERT || path.join(tlsDir, 'pbxpuls-server.crt');
const key = env.PBXPULS_TLS_KEY || path.join(tlsDir, 'pbxpuls-server.key');
const ca = path.join(tlsDir, 'pbxpuls-ca.crt');
const caKey = path.join(tlsDir, 'pbxpuls-ca.key');
const customCert = Boolean(env.PBXPULS_TLS_CERT || env.PBXPULS_TLS_KEY);
const apacheFiles = env.PBXPULS_APACHE_CONFIG === 'none' ? [] : env.PBXPULS_APACHE_CONFIG ? [env.PBXPULS_APACHE_CONFIG] : ['/etc/apache2/sites-enabled/pbxpuls-https.conf', '/etc/httpd/conf.d/pbxpuls-https.conf'];
const proxies = apacheFiles.filter(f => fs.existsSync(f)).map(f => ({ file: fs.realpathSync(f), text: fs.readFileSync(f, 'utf8') }));
const oldPort = port(env.PORT, 3000);
for (const proxy of proxies) {
  if (httpDisabled) throw Error('Existing PBXPuls Apache proxy needs internal HTTP. Keep it enabled.');
  if (!proxy.text.includes(`http://127.0.0.1:${oldPort}/`)) throw Error(`Review existing proxy ${proxy.file}: upstream differs from configured HTTP port.`);
  if (new RegExp(`Listen\\s+${httpsPort}(?:\\s|$)`).test(proxy.text)) throw Error('HTTPS port is owned by Apache; choose a different native port or retain external mode.');
  proxy.next = proxy.text.split(`http://127.0.0.1:${oldPort}/`).join(`http://127.0.0.1:${httpPort}/`);
}
if (fs.existsSync(cert) !== fs.existsSync(key)) throw Error('Incomplete TLS certificate/key pair; existing files will not be replaced.');
if (customCert && !fs.existsSync(cert)) throw Error('Configured TLS certificate/key missing');
if (fs.existsSync(cert)) {
  tls.createSecureContext({ cert: fs.readFileSync(cert), key: fs.readFileSync(key), minVersion: 'TLSv1.2' });
  const x509 = new X509Certificate(fs.readFileSync(cert));
  if (Date.parse(x509.validTo) <= Date.now() || Date.parse(x509.validFrom) > Date.now()) throw Error('TLS certificate is expired or not yet valid; renew it before updating.');
}
console.log(`HTTPS :${httpsPort}; HTTP ${httpDisabled ? 'disabled' : `127.0.0.1:${httpPort}`}; certificate ${cert}`);
console.log(`Existing PBXPuls Apache proxies to preserve: ${proxies.length}`);
if (!apply) { console.log('Preview only. Run with --apply after stopping PBXPuls.'); process.exit(0); }
if (process.getuid?.() !== 0) throw Error('Run as root');
// The updater stops PBXPuls before apply. Never silently steal an occupied port.
for (const p of httpDisabled ? [httpsPort] : [httpsPort, httpPort]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(Error(`Port ${p} is occupied; stop PBXPuls before applying HTTPS.`)));
    server.listen(p, '0.0.0.0', () => server.close(resolve));
  });
}
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
const apacheCommand = fs.existsSync('/etc/apache2') ? 'apache2ctl' : 'apachectl';
const apacheService = fs.existsSync('/etc/apache2') ? 'apache2' : 'httpd';
const backup = env.PBXPULS_HTTPS_BACKUP_DIR || fs.mkdtempSync('/root/pbxpuls-https-backup-');
fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(backup, 'env'), original, { mode: 0o600 });
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
let rollback = `#!/usr/bin/env bash\nset -eu\ncp -p ${quote(path.join(backup, 'env'))} ${quote(envPath)}\n`;
proxies.forEach((proxy, i) => {
  fs.copyFileSync(proxy.file, path.join(backup, `proxy-${i}`));
  rollback += `cp ${quote(path.join(backup, `proxy-${i}`))} ${quote(proxy.file)}\n`;
});
if (proxies.length) rollback += `${apacheCommand} -t\nsystemctl reload ${apacheService}\n`;
fs.writeFileSync(path.join(backup, 'rollback.sh'), rollback, { mode: 0o700 });
try {
  if (!fs.existsSync(cert)) {
    fs.mkdirSync(tlsDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(ca) !== fs.existsSync(caKey)) throw Error('Incomplete existing CA; refusing replacement');
    const temp = fs.mkdtempSync(path.join(tlsDir, '.generate-'));
    fs.chmodSync(temp, 0o700);
    const openssl = args => run('openssl', args);
    if (!fs.existsSync(ca)) {
      fs.writeFileSync(path.join(temp, 'ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n[dn]\nCN=PBXPuls Internal Root CA\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n');
      openssl(['req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256', '-days', '3650', '-config', path.join(temp, 'ca.cnf'), '-keyout', path.join(temp, 'ca.key'), '-out', path.join(temp, 'ca.crt')]);
      fs.chmodSync(path.join(temp, 'ca.key'), 0o600);
      fs.copyFileSync(path.join(temp, 'ca.key'), caKey, fs.constants.COPYFILE_EXCL);
      fs.copyFileSync(path.join(temp, 'ca.crt'), ca, fs.constants.COPYFILE_EXCL);
    }
    const names = new Set(['localhost', os.hostname(), ...(env.PBXPULS_TLS_NAMES || '').split(',').map(s => s.trim()).filter(Boolean)]);
    const addresses = new Set(['127.0.0.1', '::1']);
    for (const values of Object.values(os.networkInterfaces())) for (const nic of values || []) if (!nic.internal) addresses.add(nic.address.split('%')[0]);
    for (const name of names) {
      if (net.isIP(name)) { addresses.add(name); names.delete(name); }
      else if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(name)) throw Error('Invalid TLS DNS name');
    }
    const san = [...names].map(n => `DNS:${n}`).concat([...addresses].map(n => `IP:${n}`)).join(',');
    fs.writeFileSync(path.join(temp, 'server.ext'), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
    openssl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=PBXPuls', '-keyout', path.join(temp, 'server.key'), '-out', path.join(temp, 'server.csr')]);
    fs.chmodSync(path.join(temp, 'server.key'), 0o600);
    openssl(['x509', '-req', '-in', path.join(temp, 'server.csr'), '-CA', ca, '-CAkey', caKey, '-CAcreateserial', '-days', '397', '-sha256', '-extfile', path.join(temp, 'server.ext'), '-out', path.join(temp, 'server.crt')]);
    fs.copyFileSync(path.join(temp, 'server.key'), key, fs.constants.COPYFILE_EXCL);
    fs.copyFileSync(path.join(temp, 'server.crt'), cert, fs.constants.COPYFILE_EXCL);
    // Only this newly created temporary directory is removed.
    fs.rmSync(temp, { recursive: true });
  }
  const values = { PBXPULS_HTTPS_MODE: 'native', PBXPULS_HTTPS_PORT: String(httpsPort), PORT: String(httpPort), PBXPULS_HTTP_HOST: '127.0.0.1', PBXPULS_TLS_CERT: cert, PBXPULS_TLS_KEY: key };
  let next = original;
  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n"\\]/.test(value)) throw Error('Unsupported character in TLS path');
    const line = `${name}="${value}"`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    next = pattern.test(next) ? next.replace(pattern, () => line) : next.trimEnd() + '\n' + line + '\n';
  }
  fs.writeFileSync(envPath, next, { mode: 0o600 });
  if (fs.existsSync(ca)) {
    for (const dir of ['public', 'dist']) if (fs.existsSync(path.join(app, dir))) fs.copyFileSync(ca, path.join(app, dir, 'pbxpuls-ca.crt'));
    console.log(`CA SHA256: ${new X509Certificate(fs.readFileSync(ca)).fingerprint256}`);
  }
  for (const proxy of proxies) fs.writeFileSync(proxy.file, proxy.next);
  if (proxies.length) { run(apacheCommand, ['-t']); run('systemctl', ['reload', apacheService]); }
  console.log(`HTTPS configured. Backup: ${backup}. Trust the CA on client computers, then open https://<PBX>:${httpsPort}.`);
} catch (error) {
  run('bash', [path.join(backup, 'rollback.sh')]);
  // Never include subprocess stderr: it may contain deployment secrets.
  throw Error(`HTTPS setup failed; previous configuration restored (${error.code || error.name || 'error'}).`);
}
