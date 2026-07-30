import assert from 'node:assert/strict';
import {
  decodeMtsAutoSecretaryLog,
  mtsAutoSecretaryStatusLabel,
  mtsAutoSecretarySipResult,
  normalizeMtsAutoSecretaryCalls,
  normalizeMtsAutoSecretaryPhone
} from '../server/balance/providers/mtsAutoSecretary.js';
import { matchMtsAutoSecretaryCalls, normalizeCallNumber } from '../server/balance/reconciliation/mtsAutoSecretaryMatching.js';

assert.equal(normalizeMtsAutoSecretaryPhone('+7 (978) 123-45-67'), '9781234567');
assert.equal(normalizeMtsAutoSecretaryPhone('8 978 123 45 67'), '9781234567');
assert.equal(normalizeMtsAutoSecretaryPhone('9781234567'), '9781234567');
assert.equal(normalizeMtsAutoSecretaryPhone('123'), '');
assert.equal(mtsAutoSecretaryStatusLabel('inbound', null, 0), 'Соединён');
assert.equal(mtsAutoSecretaryStatusLabel('inbound', null, -3), 'Завершён в очереди');
assert.equal(mtsAutoSecretaryStatusLabel('outbound', 1280, null), 'Соединён');
assert.equal(mtsAutoSecretaryStatusLabel('outbound', 1284, null), 'Завершён во время дозвона');
assert.equal(mtsAutoSecretaryStatusLabel('outbound', 486, null), 'Абонент занят');
assert.equal(mtsAutoSecretaryStatusLabel('outbound', 9999, null), 'Неизвестный код 9999');
assert.equal(mtsAutoSecretarySipResult(486)?.label, 'Абонент занят');
assert.equal(mtsAutoSecretarySipResult(1280), null);
assert.equal(normalizeCallNumber('+7 (978) 705-77-86'), '9787057786');
assert.equal(normalizeCallNumber('8 978 705 77 86'), '9787057786');
assert.equal(normalizeCallNumber('9787057786'), '9787057786');

const decoded = decodeMtsAutoSecretaryLog(
  'bPhr TryToCall:79891206012-(01) Busy(486) MnCh-2 CallTo-74951234567 Trf_Fail'
);
assert.equal(decoded.outcomeCategory, 'technical_error');
assert.deepEqual(decoded.fallbackNumbers, ['79891206012', '74951234567']);
assert.ok(decoded.journey.some(event => event.code === 'busy'));
assert.ok(decoded.journey.some(event => event.code === 'menu_choice' && event.label.includes('2')));

const calls = normalizeMtsAutoSecretaryCalls([{
  seqId: 42,
  un: '9780000000',
  an: '79781234567',
  cn: '200',
  startTime: '2026-07-29T10:20:30',
  duration: 75,
  talkDuration: 60,
  recDuration: 55,
  result: 0,
  subResult: 0,
  log: 'TryToCall:79897654321-(01) NoAnswer',
  outbounds: [{ bn: '200', result: 0 }, { bn: '201', result: 1 }]
}, { seqId: 42 }], 'inbound');

assert.equal(calls.length, 1);
assert.equal(calls[0].id, 'mts-aa:default:inbound:42');
assert.equal(calls[0].attempts.length, 2);
assert.equal(calls[0].attempts[1].resultLabel, null);
assert.equal(calls[0].recordingAvailable, true);
assert.equal('log' in calls[0], false);
assert.equal(calls[0].outcomeCategory, 'no_connection');
assert.ok(calls[0].journey.some(event => event.code === 'no_answer'));

const matched = matchMtsAutoSecretaryCalls(calls, [{
  id: 10,
  occurredAt: '2026-07-29 10:20:35',
  direction: 'incoming',
  callerNumber: '+7 (978) 123-45-67',
  calleeNumber: '79890000000',
  amount: -3.5,
  actualUnits: 61,
  billedUnits: 60,
  billedUnitCode: 'SECOND',
  packageCounterBefore: 1000,
  packageCounterAfter: 939,
  packageCounterUsed: 61,
  actualUnitCode: 'SECOND',
  label: 'Входящий звонок',
  mavAmount: 0.3,
  markingAmount: 0.3
}]);
assert.equal(matched[0].match.confidence, 'exact');
assert.equal(matched[0].match.usageEventId, 10);
assert.equal(matched[0].match.amount, -3.5);
assert.equal(matched[0].match.packageCounterUsed, 61);
assert.equal(matched[0].match.mtsDurationSeconds, 61);
assert.equal(matched[0].match.mavAmount, 0.3);
assert.equal(matched[0].match.markingAmount, 0.3);
assert.ok(Math.abs(Number(matched[0].match.totalAmount) + 2.9) < 0.000001);

const redirected = matchMtsAutoSecretaryCalls(calls, [{
  id: 11,
  occurredAt: '2026-07-29 10:20:36',
  direction: 'outgoing',
  callerNumber: '79890000000',
  calleeNumber: '200',
  amount: 0,
  actualUnits: 60,
  billedUnits: 60,
  billedUnitCode: 'SECOND',
  packageCounterBefore: 939,
  packageCounterAfter: 879,
  packageCounterUsed: 60,
  actualUnitCode: 'SECOND',
  label: 'Переадресация'
}]);
assert.equal(redirected[0].match.confidence, 'exact');
assert.equal(redirected[0].match.usageEventId, 11);
assert.ok(redirected[0].match.reasons.includes('исходящее плечо переадресации'));

const nearest = matchMtsAutoSecretaryCalls(calls, [{
  id: 12, occurredAt: '2026-07-29 10:22:00', direction: 'outgoing',
  callerNumber: null, calleeNumber: '200', amount: 0, actualUnits: 60, billedUnits: 60,
  billedUnitCode: 'SECOND',
  packageCounterBefore: null, packageCounterAfter: null, packageCounterUsed: null,
  actualUnitCode: 'SECOND', label: null
}, {
  id: 13, occurredAt: '2026-07-29 10:22:30', direction: 'outgoing',
  callerNumber: null, calleeNumber: '200', amount: 0, actualUnits: 60, billedUnits: 60,
  billedUnitCode: 'SECOND',
  packageCounterBefore: null, packageCounterAfter: null, packageCounterUsed: null,
  actualUnitCode: 'SECOND', label: null
}]);
assert.equal(nearest[0].match.confidence, 'likely');
assert.equal(nearest[0].match.usageEventId, 12);

const unmatchedNoAnswer = matchMtsAutoSecretaryCalls(calls, []);
assert.equal(unmatchedNoAnswer[0].match.explanation, 'Не тарифицировался: Нет ответа');

const connectedWithoutBilling = normalizeMtsAutoSecretaryCalls([{
  seqId: 43, startTime: '2026-07-29T11:00:00', talkDuration: 10, log: 'Conn'
}], 'outbound');
assert.equal(matchMtsAutoSecretaryCalls(connectedWithoutBilling, [])[0].match.explanation, 'Нет строки в MTS Business');

const sipFailure = normalizeMtsAutoSecretaryCalls([{
  seqId: 44, startTime: '2026-07-29T12:00:00', talkDuration: 0,
  outbounds: [{ bn: '79891234567', result: 503 }]
}], 'outbound');
assert.equal(sipFailure[0].outcomeCategory, 'technical_error');
assert.equal(matchMtsAutoSecretaryCalls(sipFailure, [])[0].match.explanation, 'Техническая ошибка: SIP-сервис недоступен');

console.log('MTS Auto Secretary normalization tests passed');
