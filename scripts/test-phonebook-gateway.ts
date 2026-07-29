import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPhonebookSlug, renderGrandstreamPhonebook, renderYealinkPhonebook, type PhonebookContact } from '../server/phonebookGateway.js';

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

console.log('phonebook gateway adapter tests: OK');
