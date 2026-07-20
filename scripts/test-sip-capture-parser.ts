import assert from 'node:assert/strict';
import { TcpdumpTextStreamParser, parseTcpdumpPacket } from '../server/sipCaptureParser.js';

const invite = `17:00:00.100000 IP 192.168.1.7.6161 > 192.168.1.14.5160: UDP, length 200\nINVITE sip:200@192.168.1.14 SIP/2.0\r\nCall-ID: call-one\r\nCSeq: 1 INVITE\r\nContent-Length: 0\r\n\r\n`;
const responses = `17:00:00.200000 IP 192.168.1.14.5160 > 192.168.1.7.6161: UDP, length 100\nSIP/2.0 100 Trying\nCall-ID: call-one\nCSeq: 1 INVITE\nContent-Length: 0\n\nSIP/2.0 180 Ringing\nCall-ID: call-one\nCSeq: 1 INVITE\nContent-Length: 0\n\n`;
const bye = `17:00:01.000000 IP 192.168.1.7.6161 > 192.168.1.14.5160: UDP, length 100\nACK sip:200@192.168.1.14 SIP/2.0\ni: call-one\nCSeq: 1 ACK\nContent-Length: 0\n\nBYE sip:200@192.168.1.14 SIP/2.0\ni: call-one\nCSeq: 2 BYE\nContent-Length: 0\n\n`;

assert.equal(parseTcpdumpPacket(invite).events[0]?.method, 'INVITE');
assert.equal(parseTcpdumpPacket(invite).events[0]?.callId, 'call-one');
assert.equal(parseTcpdumpPacket(invite).packet?.srcPort, 6161);
assert.equal(parseTcpdumpPacket(invite).packet?.dstPort, 5160);
assert.deepEqual(parseTcpdumpPacket(responses).events.map(event => event.code), [100, 180]);
assert.deepEqual(parseTcpdumpPacket(bye).events.map(event => event.method), ['ACK', 'BYE']);

const parsed: string[] = [];
const parser = new TcpdumpTextStreamParser(result => parsed.push(...result.events.map(event => event.method)));
const joined = invite + responses + bye;
parser.push(joined.slice(0, 73));
parser.push(joined.slice(73, 241));
parser.push(joined.slice(241));
parser.flush();
assert.deepEqual(parsed, ['INVITE', '100 Trying', '180 Ringing', 'ACK', 'BYE']);

const tls = parseTcpdumpPacket('17:00:02.000000 IP 10.0.0.1.5061 > 10.0.0.2.40000: Flags [P.], length 40\n....encrypted....');
assert.equal(tls.tls, true);
assert.equal(tls.events.length, 0);

console.log('SIP capture parser regression tests: OK');
