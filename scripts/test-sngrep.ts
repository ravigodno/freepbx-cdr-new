import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTcpdumpPacket } from '../server/sipCaptureParser.js';
import { buildSafeSipBpf, buildSipDialogs, redactSipSecrets, validateCaptureHost, validateCapturePort } from '../server/sipDialogs.js';

const invite=`17:00:00.100000 IP 192.168.1.7.6161 > 192.168.1.14.5160: UDP, length 400\nINVITE sip:200@192.168.1.14 SIP/2.0\r\nFrom: <sip:100@pbx>;tag=from1\r\nTo: <sip:200@pbx>\r\nCall-ID: real-call-1\r\nCSeq: 1 INVITE\r\nVia: SIP/2.0/UDP 192.168.1.7:6161;branch=z9hG4bK-one\r\nAuthorization: Digest username="100", nonce="secret", response="abcdef"\r\nUser-Agent: Test phone\r\nContent-Type: application/sdp\r\n\r\nc=IN IP4 192.168.1.7\r\nm=audio 12000 RTP/AVP 8\r\na=rtpmap:8 PCMA/8000\r\n`;
const ringing=`17:00:01.100000 IP 192.168.1.14.5160 > 192.168.1.7.6161: UDP, length 160\nSIP/2.0 180 Ringing\r\nFrom: <sip:100@pbx>;tag=from1\r\nTo: <sip:200@pbx>;tag=to1\r\nCall-ID: real-call-1\r\nCSeq: 1 INVITE\r\n\r\n`;
const cancelled=`17:00:02.100000 IP 192.168.1.7.6161 > 192.168.1.14.5160: UDP, length 160\nCANCEL sip:200@192.168.1.14 SIP/2.0\r\nCall-ID: real-call-1\r\nCSeq: 2 CANCEL\r\n\r\n`;
const rejected=`17:00:02.200000 IP 192.168.1.14.5160 > 192.168.1.7.6161: UDP, length 160\nSIP/2.0 487 Request Terminated\r\nCall-ID: real-call-1\r\nCSeq: 1 INVITE\r\n\r\n`;
const events=[invite,invite,ringing,cancelled,rejected].flatMap(value=>parseTcpdumpPacket(value).events);
assert.equal(events[0].requestMethod,'INVITE');
assert.equal(events[0].branch,'z9hG4bK-one');
assert.deepEqual(events[0].codecs,['PCMA']);
assert(!events[0].raw.includes('abcdef'));
assert(events[0].raw.includes('Authorization: ***'));
const dialogs=buildSipDialogs(events);
assert.equal(dialogs.length,1);
assert.equal(dialogs[0].state,'Cancelled');
assert.equal(dialogs[0].retransmissions,1);
assert.equal(dialogs[0].finalCode,487);
assert.equal(buildSafeSipBpf([5060,5160],'192.168.1.14'),'(udp or tcp) and (port 5060 or port 5160) and host 192.168.1.14');
assert.throws(()=>validateCaptureHost('../etc/shadow'));
assert.throws(()=>validateCaptureHost('999.1.1.1'));
assert.equal(validateCapturePort('5060'),5060);
assert.throws(()=>validateCapturePort('5060;id'));
assert.equal(redactSipSecrets('Proxy-Authorization: Digest response=abc, nonce="xyz"'),'Proxy-Authorization: ***');

const server=fs.readFileSync('server.ts','utf8');
const ui=fs.readFileSync('src/modules/monitoring/tabs/monitoring/SipDialogsTab.tsx','utf8');
for(const route of ['/api/diagnostics/sngrep/capabilities','/api/diagnostics/sngrep/session','/api/diagnostics/sngrep/dialogs','/api/diagnostics/sngrep/messages/:messageId/raw','/api/diagnostics/sngrep/session/pcap']){
  assert(server.includes(route),`missing route ${route}`);
}
assert((server.match(/requirePermission\('view_sngrep'\)/g)||[]).length>=7,'SNGREP endpoints must be guarded');
assert(server.includes("spawn('tcpdump', args")&&!server.includes("spawn('tcpdump', args, { shell: true"),'tcpdump must run without shell');
assert(ui.includes('PBXPuls SIP parser'));
assert(!/mockDialogs|Math\.random|demoDialog/i.test(ui));
assert(ui.includes('/messages/${encodeURIComponent(id)}/raw'),'raw must be lazy');
assert(ui.includes('controller.current?.abort()'),'frontend requests must be cancellable');

console.log('SNGREP / SIP-dialogs tests: OK');
