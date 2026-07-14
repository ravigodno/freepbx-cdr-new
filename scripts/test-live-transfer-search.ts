import assert from 'node:assert/strict';
import { rankLiveTransferTargets } from '../server/liveTransferSearch.js';
import { getLiveTransferPresenceLabel } from '../src/components/liveTransferPresence.js';
import { addCallTarget } from '../src/components/callTargetSelection.js';
import { createConferenceFromActiveCall, validateConferenceParticipants } from '../server/conferenceService.js';
import {
  buildConsultTransferCapabilities,
  transitionConsultTransferState,
  unavailableConsultOperation,
  validateConsultTransferTarget
} from '../server/consultTransferService.js';

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
  id: 'client-without-number',
  name: 'Клиент без номера',
  company: 'Внешняя компания',
  number: '',
  phones: [],
  type: 'client',
  createdAt: '',
  updatedAt: ''
});

const prefixResults = rankLiveTransferTargets(directory, '20', '', 50);
assert.deepEqual(Array.from(new Set(prefixResults.map(item => item.extension))).slice(0, 3), ['200', '201', '202']);

const cappedResults = rankLiveTransferTargets(directory, '', '', 50);
assert.equal(cappedResults.length, 50, 'large directory result must be capped at 50');

const exactResults = rankLiveTransferTargets(directory, '201', '', 50);
assert.equal(exactResults[0]?.targetNumber, '201', 'exact extension must rank first');
assert.equal(exactResults[0]?.targetType, 'internal');
assert.equal(exactResults[0]?.canTransfer, true);

const nameResults = rankLiveTransferTargets(directory, 'гру', '', 50);
assert.equal(nameResults[0]?.name, 'Грунин К.В.', 'Cyrillic name prefix must match case-insensitively');
assert.equal(nameResults[0]?.canTransfer, true, 'a non-internal contact with explicit internalExtension must be transferable');
assert.deepEqual(
  nameResults.filter(item => item.id === 'grunin-201').map(item => item.targetNumber),
  ['201', '79788101219', '31231231'],
  'one contact must expose separate internal, primary and additional phone targets'
);

const gruninPhoneResults = rankLiveTransferTargets(directory, '79788101219', '', 50);
assert.equal(gruninPhoneResults[0]?.targetNumber, '79788101219', 'normalized primary phone must match');
assert.equal(rankLiveTransferTargets(directory, '89788101219', '', 50)[0]?.targetNumber, '79788101219', '8-prefix phone variant must match +7');
assert.equal(rankLiveTransferTargets(directory, '31231231', '', 50)[0]?.targetNumber, '31231231', 'additional phone must match');

const raNameResults = rankLiveTransferTargets(directory, 'РА Выгодно', '', 50);
assert.equal(raNameResults[0]?.id, 'ra-vygodno', 'contact must be found by full name/company');
const raPhoneTarget = raNameResults.find(item => item.targetNumber === '74994907209');
assert.equal(raPhoneTarget?.targetType, 'directory_phone');
assert.equal(raPhoneTarget?.canTransfer, true, 'directory phone is enabled by default');
assert.equal(rankLiveTransferTargets(directory, '74994907209', '', 50)[0]?.targetNumber, '74994907209', 'contact must be found by displayed phone');

const departmentResults = rankLiveTransferTargets(directory, 'прием', '', 50);
assert.ok(departmentResults.length > 0, 'е query must match ё in department');
assert.ok(departmentResults.every(item => item.department === 'Приёмная'));

const metadataResults = rankLiveTransferTargets(directory, 'резервный секретарь', '', 50);
assert.equal(metadataResults[0]?.targetNumber, '211', 'comments must participate in search');

const withoutCurrent = rankLiveTransferTargets(directory, '20', '200', 50);
assert.ok(withoutCurrent.filter(item => item.targetType === 'internal' && item.targetNumber === '200').every(item => !item.canTransfer), 'current operator extension must not be selectable');

const disabledContactResults = rankLiveTransferTargets(directory, 'Клиент без номера', '', 50);
assert.equal(disabledContactResults[0]?.id, 'client-without-number');
assert.equal(disabledContactResults[0]?.canTransfer, false);
assert.equal(disabledContactResults[0]?.targetNumber, '');
assert.equal(disabledContactResults[0]?.transferDisabledReason, 'Нет допустимого номера для переадресации');

const filteredResults = rankLiveTransferTargets([
  { id: 'hidden', type: 'internal', number: '500', name: 'Hidden', hidden: true },
  { id: 'disabled', type: 'internal', number: '501', name: 'Disabled', disabled: true },
  { id: 'spam', type: 'internal', number: '503', name: 'Spam', isSpam: true },
  { id: 'blacklisted', type: 'internal', number: '504', name: 'Blacklisted', isBlacklisted: true },
  { id: 'client', type: 'client', number: '79788101210', name: 'Client' },
  { id: 'allowed', type: 'internal', number: '502', name: 'Allowed' }
], '', '', 50);
assert.ok(!filteredResults.some(item => ['hidden', 'disabled', 'spam', 'blacklisted'].includes(item.id)), 'hidden, disabled, spam and blacklist contacts must be excluded');
assert.equal(filteredResults.find(item => item.id === 'client')?.canTransfer, true, 'directory phone must be a transfer target when enabled');
assert.equal(filteredResults.find(item => item.id === 'allowed')?.canTransfer, true, 'enabled internal extension must remain selectable');

const externalDisabledBySetting = rankLiveTransferTargets([
  { id: 'client', type: 'client', number: '79788101210', name: 'Client' }
], 'Client', '', 50, 'directory', false);
assert.equal(externalDisabledBySetting[0]?.targetType, 'directory_phone');
assert.equal(externalDisabledBySetting[0]?.canTransfer, false);
assert.equal(externalDisabledBySetting[0]?.transferDisabledReason, 'Перевод на номера справочника отключён');

assert.equal(rankLiveTransferTargets([], '79780000000', '', 50).length, 0, 'manual external number outside directory must not become a target');
assert.equal(getLiveTransferPresenceLabel('unknown'), '', 'unknown status badge must be hidden');
assert.equal(getLiveTransferPresenceLabel('online'), 'Онлайн');

const metadataResultsWithCustomField = rankLiveTransferTargets([
  {
    id: 'metadata-contact',
    type: 'client',
    name: 'Контакт',
    number: '79990000000',
    linkedExternalNumber: '84950000001',
    transferPhoneNumbers: ['+7 (999) 000-00-02'],
    searchMetadata: ['Любимый клиент'],
    internalExtension: '205'
  }
], 'любимый', '', 50);
assert.deepEqual(metadataResultsWithCustomField[0]?.metadataMatches, ['Любимый клиент'], 'allowed metadata must participate in search');
assert.ok(metadataResultsWithCustomField.some(item => item.targetNumber === '74950000001'), 'linked external number must be a separate target');
assert.ok(metadataResultsWithCustomField.some(item => item.targetNumber === '79990000002'), 'allowed phone metadata must be a separate target');

const internal201 = exactResults[0];
assert.ok(internal201);
assert.deepEqual(addCallTarget('transfer', [], internal201, '100').selected.map(item => item.targetNumber), ['201'], 'transfer mode must use one target');
const conferenceFirst = addCallTarget('conference', [], internal201, '100');
assert.equal(conferenceFirst.error, '');
const conferenceDuplicate = addCallTarget('conference', conferenceFirst.selected, internal201, '100');
assert.equal(conferenceDuplicate.error, 'Участник уже выбран', 'conference mode must reject duplicates');
assert.equal(addCallTarget('conference', [], internal201, '201').error, 'Текущий оператор уже участвует в звонке');
const externalTarget = gruninPhoneResults.find(item => item.targetType === 'directory_phone');
assert.ok(externalTarget?.canConference, 'directory phone must be conference-capable when external directory calls are enabled');
assert.equal(addCallTarget('meeting', [], externalTarget!, '').selected.length, 1, 'meeting mode must accept an allowed directory phone');

const validated = validateConferenceParticipants([internal201, externalTarget!], [internal201, externalTarget!], '100');
assert.equal(validated.valid, true);
assert.equal(validated.participants.length, 2);
const rejectedCurrent = validateConferenceParticipants([internal201], [internal201], '201');
assert.equal(rejectedCurrent.valid, false, 'backend validation must reject the current operator');
const unavailableConference = await createConferenceFromActiveCall({
  conferenceAvailable: false,
  mechanism: 'confbridge',
  reason: 'Безопасный executor не включён',
  checked: []
});
assert.equal(unavailableConference.success, false, 'unavailable backend must never report fake conference success');

const consultSelection = addCallTarget('consult', [], internal201, '100');
assert.deepEqual(consultSelection.selected.map(item => item.targetNumber), ['201'], 'consult mode must select one target');
assert.equal(addCallTarget('consult', [], internal201, '201').error, 'Текущий оператор уже участвует в звонке');
assert.equal(validateConsultTransferTarget(null, [internal201], '100', '74990000000').valid, false, 'consult must reject empty target');
assert.equal(validateConsultTransferTarget(internal201, [internal201], '201', '74990000000').valid, false, 'consult must reject current operator');
assert.equal(validateConsultTransferTarget(internal201, [internal201], '100', '74990000000').valid, true, 'consult must accept authoritative internal extension');
const hiddenTarget = { ...internal201, id: 'hidden', targetNumber: '299', extension: '299' };
assert.equal(validateConsultTransferTarget(hiddenTarget, [internal201], '100', '74990000000').valid, false, 'consult must reject hidden/spam targets absent from authoritative results');

const unavailableConsult = buildConsultTransferCapabilities({
  amiConfigured: true,
  activeChannelsVisible: true,
  operatorChannelFound: true,
  customerChannelFound: true,
  bridgeFound: true,
  atxferActionAvailable: true
});
assert.equal(unavailableConsult.mechanism, 'ami-atxfer');
assert.equal(unavailableConsult.available, false, 'Atxfer presence alone must not enable unsafe consult workflow');
assert.equal(unavailableConsultOperation(unavailableConsult).success, false, 'consult foundation must never report fake success');

let consultState = transitionConsultTransferState('idle', 'holding_customer');
assert.equal(consultState.valid, true);
consultState = transitionConsultTransferState(consultState.state, 'dialing_target');
consultState = transitionConsultTransferState(consultState.state, 'talking_to_target');
consultState = transitionConsultTransferState(consultState.state, 'ready_to_complete');
assert.equal(transitionConsultTransferState(consultState.state, 'completed').state, 'completed');
assert.equal(transitionConsultTransferState('talking_to_target', 'cancelled').state, 'cancelled');
assert.equal(transitionConsultTransferState('idle', 'completed').valid, false, 'invalid consult state transition must be rejected');

console.log('Live transfer search ranking tests passed');
