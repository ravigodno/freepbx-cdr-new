import assert from 'node:assert/strict';
import { parseLogLine, parseMultilineLog } from '../server/logAnalysis/parsers.js';
import { sanitizeLogText } from '../server/logAnalysis/redaction.js';
import type { LogCategory, LogSourceDefinition } from '../server/logAnalysis/types.js';

const source = (parserKey: string, category: LogCategory): LogSourceDefinition => ({
  sourceKey: `test:${parserKey}`, displayName: parserKey, category, sourceType: 'file',
  canonicalPath: `/var/log/${parserKey}`, parserKey, platform: 'linux', collectorVersion: 'test'
});

const fixtures: Array<[string, LogSourceDefinition, string, string, string?]> = [
  ['Jul 20 10:00:00 pbx asterisk[101]: Registration for trunk1 timed out from 203.0.113.10', source('asterisk_full','asterisk'), 'sip_registration_timeout', 'error', '203.0.113.10'],
  ['[2026-07-20 10:00:01] NOTICE PJSIP endpoint extension=101 Registered from 192.0.2.2', source('asterisk_full','asterisk'), 'sip_registered', 'info', '192.0.2.2'],
  ['[2026-07-20 10:00:02] WARNING PJSIP authentication failed for endpoint=102 from 198.51.100.2', source('asterisk_full','asterisk'), 'sip_authentication_failed', 'warning', '198.51.100.2'],
  ['Jul 20 10:00:03 pbx chan_sip: Retransmission timeout reached on transmission from 198.51.100.3', source('asterisk_full','asterisk'), 'sip_registration_timeout', 'error', '198.51.100.3'],
  ['[2026-07-20 10:00:04] WARNING RTP timeout on channel PJSIP/101', source('asterisk_full','asterisk'), 'rtp_timeout', 'warning'],
  ['[2026-07-20 10:00:05] ERROR AGI script failed with exit status 1', source('asterisk_full','asterisk'), 'agi_error', 'error'],
  ['Jul 20 10:01:00 host sshd[22]: Failed password for invalid user demo from 203.0.113.5 port 33333 ssh2', source('auth','security'), 'ssh_auth_failed', 'warning', '203.0.113.5'],
  ['Jul 20 10:01:01 host sshd[23]: Accepted publickey for root from 203.0.113.6 port 22 ssh2', source('auth','security'), 'ssh_login_publickey', 'notice', '203.0.113.6'],
  ['2026-07-20 10:02:00 fail2ban.actions [123]: NOTICE [sshd] Found 203.0.113.7', source('fail2ban','fail2ban'), 'fail2ban_found', 'warning', '203.0.113.7'],
  ['2026-07-20 10:02:01 fail2ban.actions [124]: NOTICE [sshd] Ban 203.0.113.7', source('fail2ban','fail2ban'), 'fail2ban_ban', 'notice', '203.0.113.7'],
  ['203.0.113.8 - - [20/Jul/2026:10:03:00 +0300] "GET /admin HTTP/1.1" 401 100', source('nginx','web'), 'http_auth_denied', 'warning', '203.0.113.8'],
  ['203.0.113.8 - - [20/Jul/2026:10:03:01 +0300] "GET /missing HTTP/1.1" 404 10', source('nginx','web'), 'http_not_found', 'notice', '203.0.113.8'],
  ['2026/07/20 10:03:02 [error] upstream returned 502 Bad Gateway', source('nginx','web'), 'http_server_error', 'error'],
  ['Jul 20 10:03:03 host apache2[99]: Apache error: PHP Fatal error', source('apache','web'), 'web_runtime_error', 'error'],
  ['Jul 20 10:04:00 host systemd[1]: asterisk.service: Failed with result exit-code', source('syslog','system'), 'service_failed', 'error'],
  ['Jul 20 10:04:01 kernel: Out of memory: Killed process 22 (mysqld)', source('syslog','system'), 'out_of_memory', 'critical'],
  ['Jul 20 10:04:02 host app: No space left on device', source('syslog','system'), 'disk_full', 'critical'],
  ['2026-07-20T10:05:00Z PBXPuls MariaDB connection refused', source('pbxpuls','pbxpuls'), 'pbxpuls_db_timeout', 'critical'],
  ['2026-07-20T10:05:01Z PBXPuls unhandled rejection Error: boom', source('pbxpuls','pbxpuls'), 'unhandled_exception', 'critical']
];

for (const [line, src, eventType, severity, ip] of fixtures) {
  const event = parseLogLine(line, src);
  assert.equal(event.eventType, eventType, line);
  assert.equal(event.severity, severity, line);
  if (ip) assert.equal(event.ip, ip, line);
  assert.match(event.occurredAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(event.fingerprint.length, 64);
}

const multiline = parseMultilineLog(['2026-07-20T10:05:01Z PBXPuls unhandled rejection Error: boom','    at handler (/app/server.js:1:2)'], source('pbxpuls','pbxpuls'));
assert.equal(multiline.length, 1);
assert.match(multiline[0].rawMessage, /at handler/);
assert.equal(parseLogLine('completely unknown record', source('syslog','system')).eventType, 'unclassified_log');
assert.doesNotThrow(() => parseLogLine('\u0000broken\ud800', source('syslog','system')));

const masked = sanitizeLogText('password=123456 Authorization: Bearer abc.def mysql://user:pass@host/db token=secret');
assert.doesNotMatch(masked, /123456|abc\.def|user:pass|token=secret/);

const pidA = parseLogLine('Jul 20 10:10:00 host asterisk[111]: WARNING timeout peer=101', source('asterisk_full','asterisk'));
const pidB = parseLogLine('Jul 20 10:10:01 host asterisk[222]: WARNING timeout peer=101', source('asterisk_full','asterisk'));
assert.equal(pidA.fingerprint, pidB.fingerprint);
const otherIp = parseLogLine('Jul 20 10:10:01 host asterisk[222]: WARNING timeout peer=101 from 203.0.113.20', source('asterisk_full','asterisk'));
assert.notEqual(pidA.fingerprint, otherIp.fingerprint);

console.log(`log-analysis parser tests: ${fixtures.length + 6} passed`);
