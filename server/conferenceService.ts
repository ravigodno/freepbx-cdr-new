import fs from 'fs';
import { runAsteriskCliCommand } from './asteriskCli.js';
import type { LiveTransferSearchTarget } from './liveTransferSearch.js';

export type ConferenceMechanism = 'confbridge' | 'meetme' | 'ami-originate' | 'unavailable';

export interface ConferenceBackendStatus {
  conferenceAvailable: boolean;
  mechanism: ConferenceMechanism;
  reason: string;
  checked: Array<{ name: string; available: boolean; detail: string }>;
}

export interface ConferenceValidationResult {
  valid: boolean;
  participants: LiveTransferSearchTarget[];
  errors: string[];
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export async function getConferenceBackendStatus(): Promise<ConferenceBackendStatus> {
  const [confBridge, meetMe] = await Promise.all([
    runAsteriskCliCommand('core show applications like ConfBridge', 3000),
    runAsteriskCliCommand('core show applications like MeetMe', 3000)
  ]);
  const confBridgeAvailable = confBridge.success && /ConfBridge/i.test(confBridge.message);
  const meetMeAvailable = meetMe.success && /MeetMe/i.test(meetMe.message);
  const freePbxModule = fs.existsSync('/var/www/html/admin/modules/conferences');
  let conferenceContext = false;
  try {
    conferenceContext = /\bConfBridge\s*\(/i.test(fs.readFileSync('/etc/asterisk/extensions_additional.conf', 'utf8'));
  } catch {
    conferenceContext = false;
  }
  const mechanism: ConferenceMechanism = confBridgeAvailable
    ? 'confbridge'
    : meetMeAvailable ? 'meetme' : 'unavailable';

  return {
    conferenceAvailable: false,
    mechanism,
    reason: mechanism === 'unavailable'
      ? 'В Asterisk не найден доступный backend конференций'
      : 'Backend конференций обнаружен, но безопасный сценарий создания динамической конференции PBXPuls ещё не включён',
    checked: [
      { name: 'asterisk_confbridge', available: confBridgeAvailable, detail: confBridgeAvailable ? 'Приложение ConfBridge доступно' : 'Приложение ConfBridge не найдено' },
      { name: 'asterisk_meetme', available: meetMeAvailable, detail: meetMeAvailable ? 'Приложение MeetMe доступно' : 'Приложение MeetMe не найдено' },
      { name: 'freepbx_conferences_module', available: freePbxModule, detail: freePbxModule ? 'Модуль Conferences установлен' : 'Модуль Conferences не найден' },
      { name: 'conference_context', available: conferenceContext, detail: conferenceContext ? 'В dialplan найден существующий ConfBridge context' : 'ConfBridge context не найден' },
      { name: 'pbxpuls_safe_executor', available: false, detail: 'Originate/bridge lifecycle для конференций намеренно не активирован' }
    ]
  };
}

export function validateConferenceParticipants(
  requested: LiveTransferSearchTarget[],
  authoritativeTargets: LiveTransferSearchTarget[],
  currentOperatorExtension = ''
): ConferenceValidationResult {
  const allowed = new Map(authoritativeTargets.map(target => [
    `${target.id}:${target.targetType}:${digits(target.targetNumber)}`,
    target
  ]));
  const current = digits(currentOperatorExtension);
  const seen = new Set<string>();
  const participants: LiveTransferSearchTarget[] = [];
  const errors: string[] = [];

  for (const candidate of requested || []) {
    const number = digits(candidate?.targetNumber);
    const key = `${candidate?.id}:${candidate?.targetType}:${number}`;
    const authoritative = allowed.get(key);
    if (!authoritative || !authoritative.canConference) {
      errors.push(`Цель ${number || 'без номера'} не разрешена для конференции`);
      continue;
    }
    if (authoritative.targetType === 'internal' && number === current) {
      errors.push(`Текущий оператор ${number} уже участвует в звонке`);
      continue;
    }
    const duplicateKey = `${authoritative.targetType}:${number}`;
    if (seen.has(duplicateKey)) {
      errors.push(`Участник ${number} выбран повторно`);
      continue;
    }
    seen.add(duplicateKey);
    participants.push(authoritative);
  }
  return { valid: errors.length === 0 && participants.length > 0, participants, errors };
}

async function unavailableOperation(status?: ConferenceBackendStatus) {
  const currentStatus = status || await getConferenceBackendStatus();
  return { success: false as const, error: currentStatus.reason };
}

export function createConferenceFromActiveCall(status?: ConferenceBackendStatus) {
  return unavailableOperation(status);
}

export function createNewPhoneMeeting(status?: ConferenceBackendStatus) {
  return unavailableOperation(status);
}

export function addParticipantsToConference(status?: ConferenceBackendStatus) {
  return unavailableOperation(status);
}
