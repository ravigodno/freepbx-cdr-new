import type { LiveTransferSearchTarget } from './liveTransferSearch.js';

export type ConsultTransferMechanism = 'ami-atxfer' | 'hold-originate-redirect' | 'unavailable';
export type ConsultTransferState =
  | 'idle'
  | 'holding_customer'
  | 'dialing_target'
  | 'talking_to_target'
  | 'ready_to_complete'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface ConsultTransferCapabilities {
  available: boolean;
  mechanism: ConsultTransferMechanism;
  reason: string;
  checked: Array<{ name: string; available: boolean; detail: string }>;
}

export interface ConsultTransferDiagnosticInput {
  amiConfigured: boolean;
  activeChannelsVisible: boolean;
  operatorChannelFound: boolean;
  customerChannelFound: boolean;
  bridgeFound: boolean;
  atxferActionAvailable: boolean;
}

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export function buildConsultTransferCapabilities(input: ConsultTransferDiagnosticInput): ConsultTransferCapabilities {
  const mechanism: ConsultTransferMechanism = input.atxferActionAvailable ? 'ami-atxfer' : 'unavailable';
  const channelIdentityReady = input.operatorChannelFound && input.customerChannelFound && input.bridgeFound;
  const checked = [
    { name: 'ami_configured', available: input.amiConfigured, detail: input.amiConfigured ? 'AMI настроен' : 'AMI не настроен' },
    { name: 'active_channels', available: input.activeChannelsVisible, detail: input.activeChannelsVisible ? 'Активные каналы доступны' : 'Активные каналы не видны' },
    { name: 'operator_channel', available: input.operatorChannelFound, detail: input.operatorChannelFound ? 'Канал оператора определён' : 'Канал оператора не определён' },
    { name: 'customer_channel', available: input.customerChannelFound, detail: input.customerChannelFound ? 'Канал клиента определён' : 'Канал клиента не определён' },
    { name: 'bridge', available: input.bridgeFound, detail: input.bridgeFound ? 'Bridge активного звонка определён' : 'Bridge активного звонка не определён' },
    { name: 'ami_atxfer', available: input.atxferActionAvailable, detail: input.atxferActionAvailable ? 'AMI action Atxfer доступен' : 'AMI action Atxfer не найден' },
    { name: 'pbxpuls_consult_executor', available: false, detail: 'Безопасный hold/consult/complete/cancel lifecycle ещё не включён' }
  ];
  const identityReason = channelIdentityReady
    ? ''
    : 'не удалось однозначно определить каналы оператора, клиента и bridge';
  return {
    available: false,
    mechanism,
    reason: mechanism === 'unavailable'
      ? 'Консультационная переадресация недоступна: AMI Atxfer не найден'
      : `Консультационная переадресация недоступна: ${identityReason || 'безопасный lifecycle удержания и возврата клиента ещё не подтверждён'}`,
    checked
  };
}

export function validateConsultTransferTarget(
  requested: LiveTransferSearchTarget | null | undefined,
  authoritativeTargets: LiveTransferSearchTarget[],
  operatorExtension: unknown,
  customerNumber: unknown
): { valid: boolean; target?: LiveTransferSearchTarget; error?: string } {
  const number = digits(requested?.targetNumber);
  if (!requested || !number) return { valid: false, error: 'Не выбрана цель консультации' };
  if (requested.targetType === 'internal' && number === digits(operatorExtension)) {
    return { valid: false, error: 'Нельзя выбрать текущего оператора' };
  }
  if (number === digits(customerNumber)) return { valid: false, error: 'Нельзя выбрать текущего клиента' };
  const target = authoritativeTargets.find(candidate => candidate.id === requested.id
    && candidate.targetType === requested.targetType
    && digits(candidate.targetNumber) === number);
  if (!target || !target.canTransfer) return { valid: false, error: 'Цель не разрешена справочником' };
  return { valid: true, target };
}

const transitions: Record<ConsultTransferState, ConsultTransferState[]> = {
  idle: ['holding_customer', 'failed'],
  holding_customer: ['dialing_target', 'cancelled', 'failed'],
  dialing_target: ['talking_to_target', 'cancelled', 'failed'],
  talking_to_target: ['ready_to_complete', 'cancelled', 'failed'],
  ready_to_complete: ['completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: ['cancelled']
};

export function transitionConsultTransferState(current: ConsultTransferState, next: ConsultTransferState) {
  if (!transitions[current]?.includes(next)) {
    return { valid: false, state: current, error: `Недопустимый переход ${current} -> ${next}` };
  }
  return { valid: true, state: next, error: '' };
}

export function unavailableConsultOperation(capabilities: ConsultTransferCapabilities) {
  return { success: false as const, state: 'failed' as const, error: capabilities.reason };
}
