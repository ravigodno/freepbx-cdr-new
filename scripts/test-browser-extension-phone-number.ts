import assert from 'node:assert/strict';

await import('../browser-extension/phone-number.js');
const normalize = (globalThis as any).PBXPulsPhoneNumber.normalizePhoneNumber;

assert.equal(normalize('+7 (978) 810-12-10'), '+79788101210');
assert.equal(normalize('8 978 810 12 10'), '89788101210');
assert.equal(normalize('tel:+7-978-810-12-10?source=crm'), '+79788101210');
assert.equal(normalize('*8011'), '*8011');
assert.equal(normalize('11'), '11');
assert.equal(normalize('Позвоните +7 978 810-12-10'), '');
assert.equal(normalize('заказ 12345'), '');
assert.equal(normalize(''), '');
assert.equal(normalize('123456789012345678901'), '');

console.log('browser extension phone number: ok');
