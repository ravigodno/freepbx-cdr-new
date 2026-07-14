import fs from 'fs';
import net from 'net';
import crypto from 'crypto';
import { runAsteriskCliCommand } from './asteriskCli.js';
import type { LiveTransferSearchTarget } from './liveTransferSearch.js';
import type { AppSettings } from '../src/types.js';

export type ConferenceMechanism = 'confbridge' | 'meetme' | 'ami-originate' | 'unavailable';

export interface ConferenceBackendStatus {
  conferenceAvailable: boolean;
  meetingAvailable: boolean;
  conferenceFromCallAvailable: boolean;
  mechanism: ConferenceMechanism;
  reason: string;
  meetingReason: string;
  checked: Array<{ name: string; available: boolean; detail: string }>;
}

export interface ConferenceValidationResult {
  valid: boolean;
  participants: LiveTransferSearchTarget[];
  errors: string[];
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export async function getConferenceBackendStatus(executor = { amiConfigured: false, originateAvailable: false }): Promise<ConferenceBackendStatus> {
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

  const meetingAvailable = confBridgeAvailable && executor.amiConfigured && executor.originateAvailable;
  return {
    conferenceAvailable: false,
    meetingAvailable,
    conferenceFromCallAvailable: false,
    mechanism,
    reason: mechanism === 'unavailable'
      ? 'В Asterisk не найден доступный backend конференций'
      : 'Конференция из активного звонка пока недоступна: безопасный re-bridge не включён',
    meetingReason: meetingAvailable
      ? 'Динамические телефонные совещания доступны через AMI Originate + ConfBridge'
      : 'Телефонные совещания недоступны: нужны ConfBridge и AMI Originate',
    checked: [
      { name: 'asterisk_confbridge', available: confBridgeAvailable, detail: confBridgeAvailable ? 'Приложение ConfBridge доступно' : 'Приложение ConfBridge не найдено' },
      { name: 'asterisk_meetme', available: meetMeAvailable, detail: meetMeAvailable ? 'Приложение MeetMe доступно' : 'Приложение MeetMe не найдено' },
      { name: 'freepbx_conferences_module', available: freePbxModule, detail: freePbxModule ? 'Модуль Conferences установлен' : 'Модуль Conferences не найден' },
      { name: 'conference_context', available: conferenceContext, detail: conferenceContext ? 'В dialplan найден существующий ConfBridge context' : 'ConfBridge context не найден' },
      { name: 'ami_originate', available: executor.originateAvailable, detail: executor.originateAvailable ? 'AMI Originate доступен' : 'AMI Originate не подтверждён' },
      { name: 'pbxpuls_meeting_executor', available: meetingAvailable, detail: meetingAvailable ? 'Executor динамических совещаний включён' : 'Executor динамических совещаний недоступен' },
      { name: 'pbxpuls_active_call_executor', available: false, detail: 'Re-bridge активного звонка намеренно не активирован' }
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

type AmiActionResult = { success: boolean; message: string };

function runAmiAction(settings: AppSettings, fields: Record<string, string>, timeoutMs = 7000): Promise<AmiActionResult> {
  return new Promise(resolve => {
    const host = settings.amiHost || 'localhost';
    const port = Number(settings.amiPort || 5038);
    const user = settings.amiUser || 'clicktocall';
    const pass = settings.amiPass || '';
    if (!host || !user || !pass) return resolve({ success: false, message: 'AMI не настроен' });
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    let buffer = '';
    let stage: 'greeting' | 'login' | 'action' = 'greeting';
    let finished = false;
    const finish = (result: AmiActionResult) => {
      if (finished) return;
      finished = true;
      try { socket.write('Action: Logoff\r\n\r\n'); socket.end(); } catch { socket.destroy(); }
      resolve(result);
    };
    socket.connect(port, host);
    socket.on('data', data => {
      buffer += data.toString();
      if (stage === 'greeting' && buffer.includes('\n')) {
        buffer = '';
        socket.write(`Action: Login\r\nUsername: ${user}\r\nSecret: ${pass}\r\nEvents: off\r\n\r\n`);
        stage = 'login';
      } else if (stage === 'login' && /\r?\n\r?\n/.test(buffer)) {
        if (!/Response:\s*Success/i.test(buffer)) return finish({ success: false, message: 'Ошибка аутентификации AMI' });
        buffer = '';
        const payload = Object.entries(fields).map(([key, value]) => `${key}: ${String(value).replace(/[\r\n]/g, '')}`).join('\r\n');
        socket.write(`${payload}\r\n\r\n`);
        stage = 'action';
      } else if (stage === 'action' && /\r?\n\r?\n/.test(buffer)) {
        const message = buffer.match(/^Message:\s*(.+)$/im)?.[1]?.trim() || '';
        finish({ success: /Response:\s*Success/i.test(buffer), message: message.slice(0, 200) });
      }
    });
    socket.on('error', error => finish({ success: false, message: error.message || 'Ошибка AMI' }));
    socket.on('timeout', () => { socket.destroy(); finish({ success: false, message: 'AMI timeout' }); });
  });
}

function meetingChannel(
  target: { targetType: 'internal' | 'directory_phone'; targetNumber: string },
  internalTechnology: Record<string, 'SIP' | 'PJSIP'>
) {
  return target.targetType === 'internal'
    ? `${internalTechnology[digits(target.targetNumber)] || 'PJSIP'}/${digits(target.targetNumber)}`
    : `Local/${digits(target.targetNumber)}@from-internal`;
}

const wait = (delayMs: number) => new Promise(resolve => setTimeout(resolve, delayMs));

export async function startPhoneMeetingRecording(
  settings: AppSettings,
  roomId: string,
  recordingFile: string
): Promise<AmiActionResult> {
  const safeRoomId = String(roomId || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const safeRecordingFile = String(recordingFile || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (!safeRoomId || !safeRecordingFile) return { success: false, message: 'Некорректные параметры записи совещания' };

  // Async Originate returns before somebody answers and creates the ConfBridge room.
  // Retry with backoff long enough to cover the configured 30-second ringing timeout.
  const retryDelays = [500, 1000, 2000, 4000, 8000, 16000, 8000];
  let lastResult: AmiActionResult = { success: false, message: 'Комната совещания ещё не создана' };
  for (const delayMs of retryDelays) {
    await wait(delayMs);
    lastResult = await runAmiAction(settings, {
      Action: 'ConfbridgeStartRecord',
      ActionID: `pbxpuls-meeting-record-${crypto.randomBytes(5).toString('hex')}`,
      Conference: safeRoomId,
      RecordFile: safeRecordingFile
    });
    if (lastResult.success || /already.*record/i.test(lastResult.message)) return { success: true, message: lastResult.message };
  }
  return lastResult;
}

export async function createNewPhoneMeeting(
  settings: AppSettings,
  initiatorExt: string,
  participants: Array<Pick<LiveTransferSearchTarget, 'targetType' | 'targetNumber'>>,
  internalTechnology: Record<string, 'SIP' | 'PJSIP'> = {}
) {
  const initiator = digits(initiatorExt);
  if (!/^\d{2,5}$/.test(initiator)) return { success: false as const, error: 'Некорректный внутренний номер инициатора' };
  const roomId = `pbxpuls-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const targets = [
    { targetType: 'internal' as const, targetNumber: initiator },
    ...participants
  ].filter((target, index, list) => list.findIndex(item => `${item.targetType}:${digits(item.targetNumber)}` === `${target.targetType}:${digits(target.targetNumber)}`) === index);
  if (targets.length < 2) return { success: false as const, error: 'Нужен хотя бы один участник кроме инициатора' };
  const recordingFile = `${roomId}.wav`;

  const invitations = targets.map(target => ({
    target,
    channelId: `pbxpuls.${Date.now()}.${crypto.randomBytes(4).readUInt32BE(0)}`
  }));
  const results = await Promise.all(invitations.map(({ target, channelId }) => runAmiAction(settings, {
    Action: 'Originate',
    ActionID: `pbxpuls-meeting-${crypto.randomBytes(5).toString('hex')}`,
    Channel: meetingChannel(target, internalTechnology),
    Application: 'ConfBridge',
    Data: roomId,
    Timeout: '30000',
    CallerID: `Совещание от ${initiator} <${initiator}>`,
    Variable: `__PBXPULS_MEETING_ID=${roomId}`,
    ChannelId: channelId,
    Async: 'true'
  })));
  const failed = results.map((result, index) => ({ result, target: invitations[index].target })).filter(item => !item.result.success);
  if (failed.length) {
    await runAmiAction(settings, { Action: 'ConfbridgeKick', Conference: roomId, Channel: 'all' });
    return { success: false as const, error: `Не удалось пригласить: ${failed.map(item => item.target.targetNumber).join(', ')}` };
  }
  return {
    success: true as const,
    roomId,
    recordingFile,
    invited: targets.map(target => digits(target.targetNumber)),
    channelIds: invitations.map(invitation => invitation.channelId),
    invitations: invitations.map(invitation => ({
      targetNumber: digits(invitation.target.targetNumber),
      targetType: invitation.target.targetType,
      channelId: invitation.channelId
    }))
  };
}

export function addParticipantsToConference(status?: ConferenceBackendStatus) {
  return unavailableOperation(status);
}
