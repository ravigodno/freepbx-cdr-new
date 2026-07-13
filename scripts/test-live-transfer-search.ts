import assert from 'node:assert/strict';
import { rankLiveTransferTargets } from '../server/liveTransferSearch.js';

const directory = Array.from({ length: 300 }, (_, index) => {
  const extension = String(100 + index);
  return {
    id: `internal-${extension}`,
    name: `Сотрудник ${extension}`,
    number: extension,
    phones: [extension],
    internalExtension: extension,
    type: 'internal' as const,
    department: index % 10 === 0 ? 'Приёмная' : 'Продажи',
    position: index % 3 === 0 ? 'Менеджер' : 'Специалист',
    comment: index === 111 ? 'Резервный секретарь' : '',
    createdAt: '',
    updatedAt: ''
  };
});

directory.push({
  id: 'grunin-201',
  name: 'Грунин К.В.',
  number: '+7 (978) 810-12-19',
  phones: ['+7 (978) 810-12-19', '31231231'],
  internalExtension: '201',
  type: 'client',
  department: 'Продажи',
  position: 'Руководитель',
  comment: '',
  createdAt: '',
  updatedAt: ''
});

directory.push({
  id: 'ra-vygodno',
  name: 'РА Выгодно',
  company: 'РА Выгодно',
  number: '74994907209',
  phones: ['74994907209'],
  internalExtension: '200',
  type: 'client',
  department: 'Реклама',
  position: '',
  comment: '',
  createdAt: '',
  updatedAt: ''
});

directory.push({
  id: 'client-without-extension',
  name: 'Клиент без добавочного',
  company: 'Внешняя компания',
  number: '+7 (999) 111-22-33',
  phones: ['+7 (999) 111-22-33'],
  type: 'client',
  createdAt: '',
  updatedAt: ''
});

const prefixResults = rankLiveTransferTargets(directory, '20', '', 50);
assert.deepEqual(Array.from(new Set(prefixResults.map(item => item.extension))).slice(0, 3), ['200', '201', '202']);

const cappedResults = rankLiveTransferTargets(directory, '', '', 50);
assert.equal(cappedResults.length, 50, 'large directory result must be capped at 50');

const exactResults = rankLiveTransferTargets(directory, '201', '', 50);
assert.equal(exactResults[0]?.extension, '201', 'exact extension must rank first');

const nameResults = rankLiveTransferTargets(directory, 'гру', '', 50);
assert.equal(nameResults[0]?.name, 'Грунин К.В.', 'Cyrillic name prefix must match case-insensitively');
assert.equal(nameResults[0]?.canTransfer, true, 'a non-internal contact with explicit internalExtension must be transferable');

const gruninPhoneResults = rankLiveTransferTargets(directory, '79788101219', '', 50);
assert.equal(gruninPhoneResults[0]?.id, 'grunin-201', 'normalized primary phone must match');
assert.equal(rankLiveTransferTargets(directory, '89788101219', '', 50)[0]?.id, 'grunin-201', '8-prefix phone variant must match +7');
assert.equal(rankLiveTransferTargets(directory, '31231231', '', 50)[0]?.id, 'grunin-201', 'additional phone must match');

const raNameResults = rankLiveTransferTargets(directory, 'РА Выгодно', '', 50);
assert.equal(raNameResults[0]?.id, 'ra-vygodno', 'contact must be found by full name/company');
assert.equal(raNameResults[0]?.extension, '200');
assert.equal(rankLiveTransferTargets(directory, '74994907209', '', 50)[0]?.id, 'ra-vygodno', 'contact must be found by displayed phone');

const departmentResults = rankLiveTransferTargets(directory, 'прием', '', 50);
assert.ok(departmentResults.length > 0, 'е query must match ё in department');
assert.ok(departmentResults.every(item => item.department === 'Приёмная'));

const metadataResults = rankLiveTransferTargets(directory, 'резервный секретарь', '', 50);
assert.equal(metadataResults[0]?.extension, '211', 'comments must participate in search');

const withoutCurrent = rankLiveTransferTargets(directory, '20', '200', 50);
assert.ok(withoutCurrent.filter(item => item.extension === '200').every(item => !item.canTransfer), 'current operator extension must not be selectable');

const disabledContactResults = rankLiveTransferTargets(directory, 'Клиент без добавочного', '', 50);
assert.equal(disabledContactResults[0]?.id, 'client-without-extension');
assert.equal(disabledContactResults[0]?.canTransfer, false);
assert.equal(disabledContactResults[0]?.extension, '');
assert.equal(disabledContactResults[0]?.transferDisabledReason, 'Нет внутреннего номера для переадресации');
assert.equal(Object.prototype.hasOwnProperty.call(disabledContactResults[0], 'targetExtension'), false, 'external phone must never be exposed as targetExtension');

const filteredResults = rankLiveTransferTargets([
  { id: 'hidden', type: 'internal', number: '500', name: 'Hidden', hidden: true },
  { id: 'disabled', type: 'internal', number: '501', name: 'Disabled', disabled: true },
  { id: 'spam', type: 'internal', number: '503', name: 'Spam', isSpam: true },
  { id: 'blacklisted', type: 'internal', number: '504', name: 'Blacklisted', isBlacklisted: true },
  { id: 'client', type: 'client', number: '79788101210', name: 'Client' },
  { id: 'allowed', type: 'internal', number: '502', name: 'Allowed' }
], '', '', 50);
assert.ok(!filteredResults.some(item => ['hidden', 'disabled', 'spam', 'blacklisted'].includes(item.id)), 'hidden, disabled, spam and blacklist contacts must be excluded');
assert.equal(filteredResults.find(item => item.id === 'client')?.canTransfer, false, 'external client phone must not be a transfer target');
assert.equal(filteredResults.find(item => item.id === 'allowed')?.canTransfer, true, 'enabled internal extension must remain selectable');

const metadataResultsWithCustomField = rankLiveTransferTargets([
  { id: 'metadata-contact', type: 'client', name: 'Контакт', number: '79990000000', searchMetadata: ['Любимый клиент'], internalExtension: '205' }
], 'любимый', '', 50);
assert.deepEqual(metadataResultsWithCustomField[0]?.metadataMatches, ['Любимый клиент'], 'allowed metadata must participate in search');

console.log('Live transfer search ranking tests passed');
