import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPhonebookSlug, renderGrandstreamPhonebook, renderYealinkPhonebook, type PhonebookContact } from '../server/phonebookGateway.js';
import { createPhonebookOnlyHandler, discoverPhonebookAllowedCidrs, isPhonebookClientAllowed } from '../server/phonebookListener.js';

const contacts: PhonebookContact[] = [{
  id: 'dir-1',
  name: 'Иванов & Партнёры',
  organization: 'АВАЛ <ООО>',
  position: 'Начальник отдела',
  department: 'Продажи',
  phones: ['101', '+7 978 123-45-67']
}];

const grandstream = renderGrandstreamPhonebook('PBXPuls', contacts);
assert.match(grandstream, /^<\?xml version="1.0" encoding="UTF-8"\?><AddressBook>/);
assert.match(grandstream, /Иванов &amp; Партнёры/);
assert.match(grandstream, /АВАЛ &lt;ООО&gt;/);
assert.equal((grandstream.match(/<Phone type="Work">/g) || []).length, 2);
assert.match(grandstream, /<Frequent>0<\/Frequent>/);
assert.match(grandstream, /<Group>1<\/Group>/);

const yealink = renderYealinkPhonebook('PBXPuls', contacts);
assert.match(yealink, /<YealinkIPPhoneDirectory>/);
assert.match(yealink, /<Name>Иванов &amp; Партнёры \(АВАЛ &lt;ООО&gt;\)<\/Name>/);
assert.equal((yealink.match(/<Telephone>/g) || []).length, 2);

const escapedTitle = renderYealinkPhonebook('Книга <офис> & филиал', contacts);
assert.match(escapedTitle, /<Title>Книга &lt;офис&gt; &amp; филиал<\/Title>/);
assert.doesNotMatch(escapedTitle, /<Title>Книга <офис>/);

const emptyPhones = renderGrandstreamPhonebook('PBXPuls', [{ ...contacts[0], phones: [] }]);
assert.equal((emptyPhones.match(/<Phone type="Work">/g) || []).length, 0);

assert.equal(buildPhonebookSlug('Общая телефонная книга'), 'obschaya-telefonnaya-kniga');
assert.equal(buildPhonebookSlug('  Sales / Москва  '), 'sales-moskva');
assert.match(buildPhonebookSlug('Телефонная книга'.repeat(10)), /^[a-z0-9-]{1,64}$/);

const gatewaySource = fs.readFileSync(new URL('../server/phonebookGateway.ts', import.meta.url), 'utf8');
assert.match(gatewaySource, /:slug\.xml\/phonebook\.xml/, 'legacy GXP16xx appended phonebook.xml route is required');

const cidrs = discoverPhonebookAllowedCidrs({
  eth0: [{
    address: '192.168.87.253',
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: '192.168.87.253/24'
  }]
}, '10.20.0.0/16');
assert.deepEqual(cidrs, ['127.0.0.0/8', '192.168.87.0/24', '10.20.0.0/16']);
assert.equal(isPhonebookClientAllowed('192.168.87.3', cidrs), true);
assert.equal(isPhonebookClientAllowed('::ffff:192.168.87.200', cidrs), true);
assert.equal(isPhonebookClientAllowed('192.168.88.3', cidrs), false);

const appCalls: string[] = [];
const handler = createPhonebookOnlyHandler(((req: any, res: any) => {
  appCalls.push(req.url);
  res.end('ok');
}) as any, ['192.168.87.0/24']);
const response = () => ({ statusCode: 200, headers: {} as Record<string, string>, setHeader(key: string, value: string) { this.headers[key] = value; }, end() {} });
handler({ url: '/api/phonebook/profiles', socket: { remoteAddress: '192.168.87.3' } } as any, response() as any);
handler({ url: '/phonebook/yealink/shared.xml', socket: { remoteAddress: '192.168.88.3' } } as any, response() as any);
handler({ url: '/phonebook/yealink/shared.xml', socket: { remoteAddress: '192.168.87.3' } } as any, response() as any);
assert.deepEqual(appCalls, ['/phonebook/yealink/shared.xml']);

console.log('phonebook gateway adapter tests: OK');
