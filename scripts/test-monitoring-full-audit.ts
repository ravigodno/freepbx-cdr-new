import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import http from 'http';

const root = process.cwd();
const startedAt = new Date().toISOString();
const checks: Array<{ name: string; ok: boolean; detail: unknown }> = [];
const requiredPermissions = [
  'view_active_calls', 'view_tcpdump', 'view_sngrep', 'view_cli', 'view_db_explorer',
  'view_sip_devices_map', 'view_quality', 'view_health', 'view_ai_pbx_admin',
  'view_security', 'view_log_analysis', 'view_call_intelligence'
];

function check(name: string, ok: boolean, detail: unknown) {
  checks.push({ name, ok, detail });
}

function read(relative: string) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function command(file: string, args: string[], timeout = 5000): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolve => execFile(file, args, { timeout, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
    resolve({ ok: !error, output: String(stdout || stderr || error?.message || '').slice(0, 4000) });
  }));
}

const server = read('server.ts');
const app = read('src/App.tsx');
const quality = read('src/modules/monitoring/tabs/monitoring/QualityTab.tsx');
const dbExplorer = read('src/modules/monitoring/tabs/monitoring/DbExplorerTab.tsx');

for (const permission of requiredPermissions) {
  check(`permission:${permission}`, server.includes(permission) && app.includes(permission), 'frontend and backend references found');
}

check('db-explorer-read-only', !/allowWriters|writeType/.test(server.slice(server.indexOf("app.post('/api/db-explorer/query'"), server.indexOf("app.get('/api/db-explorer/cdr/by-uid"))), 'write flags are absent from query endpoint');
check('fwconsole-no-shell', !/spawnSync\(command,\s*\{\s*shell:\s*true/.test(server), 'fwconsole is executed without a shell');
check('quality-production-no-simulation', server.includes('if (!isDemo) return;') && server.includes('getLatestRtcpQuality(dev.ext)') && server.includes('normalizeQualityMetrics(rtcp ?'), 'production quality requires measured RTP/RTCP data and separates endpoint availability');
check('quality-ui-empty-state', quality.includes('Нет RTCP'), 'quality UI exposes unavailable RTCP measurement state');
check('db-explorer-ui-read-only', dbExplorer.includes('Только чтение · SELECT') && !dbExplorer.includes('allowWriters:'), 'write controls are absent');
check('monitoring-polling-active-tab', app.includes("monitorMode !== 'calls'") && app.includes("monitorMode !== 'tcpdump'") && app.includes('document.hidden'), 'global monitoring polling is tab and visibility aware; SIP dialogs own their cancellable polling');

const productionFiles = [
  'server.ts', 'src/App.tsx',
  'src/modules/monitoring/tabs/monitoring/ActiveCallsTab.tsx',
  'src/modules/monitoring/tabs/monitoring/TcpdumpTab.tsx',
  'src/modules/monitoring/tabs/monitoring/SngrepTab.tsx',
  'src/modules/monitoring/tabs/monitoring/DbExplorerTab.tsx',
  'src/modules/monitoring/tabs/monitoring/QualityTab.tsx'
];
const markerRows = productionFiles.flatMap(file => {
  const content = read(file);
  return content.split(/\r?\n/).flatMap((line, index) => /\b(mock|demo|simulation|simulator|fake|fixture|sample)\b/i.test(line)
    ? [{ file, line: index + 1, text: line.trim().slice(0, 180) }]
    : []);
});
check('production-demo-marker-inventory', true, { count: markerRows.length, rows: markerRows.slice(0, 100) });

const [asteriskVersion, channels, pjsipContacts, sipPeers, ports, pm2] = await Promise.all([
  command('/usr/sbin/asterisk', ['-rx', 'core show version']),
  command('/usr/sbin/asterisk', ['-rx', 'core show channels count']),
  command('/usr/sbin/asterisk', ['-rx', 'pjsip show contacts']),
  command('/usr/sbin/asterisk', ['-rx', 'sip show peers']),
  command('/usr/sbin/ss', ['-lntup']),
  command('/usr/bin/env', ['pm2', 'jlist'], 15_000)
]);
check('asterisk-cli', asteriskVersion.ok, asteriskVersion.output.split(/\r?\n/)[0]);
check('active-channels-source', channels.ok, channels.output.trim());
check('pjsip-source', pjsipContacts.ok, { lines: pjsipContacts.output.split(/\r?\n/).length });
check('chan-sip-source', sipPeers.ok, { lines: sipPeers.output.split(/\r?\n/).length });
check('open-ports-source', ports.ok, { lines: ports.output.split(/\r?\n/).length });
check('pm2-source', pm2.ok, 'pm2 jlist readable');

const logPaths = ['/var/log/asterisk/full', '/var/log/asterisk/queue_log', '/var/log/asterisk/freepbx.log', '/var/log/secure', '/var/log/messages', '/var/log/httpd/access_log', '/var/log/httpd/error_log', '/var/log/fail2ban.log'];
for (const logPath of logPaths) {
  try {
    const stat = fs.statSync(logPath);
    check(`log:${logPath}`, fs.accessSync(logPath, fs.constants.R_OK) === undefined, { exists: true, readable: true, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  } catch (error: any) {
    check(`log:${logPath}`, false, { exists: fs.existsSync(logPath), reason: error?.code || error?.message || String(error) });
  }
}

await new Promise<void>(resolve => {
  const request = http.get('http://127.0.0.1:3000/api/monitoring/log-analysis/status', response => {
    response.resume();
    check('unauthorized-monitoring-api', response.statusCode === 401, { status: response.statusCode });
    resolve();
  });
  request.setTimeout(3000, () => request.destroy(new Error('timeout')));
  request.on('error', error => { check('unauthorized-monitoring-api', false, error.message); resolve(); });
});

const report = { startedAt, finishedAt: new Date().toISOString(), success: checks.filter(row => !row.name.startsWith('log:')).every(row => row.ok), summary: { total: checks.length, passed: checks.filter(row => row.ok).length, failed: checks.filter(row => !row.ok).length }, checks };
const outputPath = path.join(root, 'monitoring-full-audit-report.json');
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ ...report.summary, success: report.success, report: outputPath }, null, 2));
if (!report.success) process.exitCode = 1;
