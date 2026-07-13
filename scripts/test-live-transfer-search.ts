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
  number: '201',
  phones: ['201'],
  internalExtension: '201',
  type: 'internal',
  department: 'Продажи',
  position: 'Руководитель',
  comment: '',
  createdAt: '',
  updatedAt: ''
});

const prefixResults = rankLiveTransferTargets(directory, '20', '', 50);
assert.deepEqual(prefixResults.slice(0, 3).map(item => item.extension), ['200', '201', '202']);

const cappedResults = rankLiveTransferTargets(directory, '', '', 50);
assert.equal(cappedResults.length, 50, 'large directory result must be capped at 50');

const exactResults = rankLiveTransferTargets(directory, '201', '', 50);
assert.equal(exactResults[0]?.extension, '201', 'exact extension must rank first');

const nameResults = rankLiveTransferTargets(directory, 'гру', '', 50);
assert.equal(nameResults[0]?.name, 'Грунин К.В.', 'Cyrillic name prefix must match case-insensitively');

const departmentResults = rankLiveTransferTargets(directory, 'прием', '', 50);
assert.ok(departmentResults.length > 0, 'е query must match ё in department');
assert.ok(departmentResults.every(item => item.department === 'Приёмная'));

const metadataResults = rankLiveTransferTargets(directory, 'резервный секретарь', '', 50);
assert.equal(metadataResults[0]?.extension, '211', 'comments must participate in search');

const withoutCurrent = rankLiveTransferTargets(directory, '20', '200', 50);
assert.ok(!withoutCurrent.some(item => item.extension === '200'), 'current operator extension must be excluded');

const filteredResults = rankLiveTransferTargets([
  { id: 'hidden', type: 'internal', number: '500', name: 'Hidden', hidden: true },
  { id: 'disabled', type: 'internal', number: '501', name: 'Disabled', disabled: true },
  { id: 'client', type: 'client', number: '79788101210', name: 'Client' },
  { id: 'allowed', type: 'internal', number: '502', name: 'Allowed' }
], '', '', 50);
assert.deepEqual(filteredResults.map(item => item.extension), ['502'], 'only enabled internal extensions are valid targets');

console.log('Live transfer search ranking tests passed');
