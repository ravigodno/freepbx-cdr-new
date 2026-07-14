import type { LiveTransferSearchTarget } from './LiveTransferSearch';

export type CallTargetSelectorMode = 'transfer' | 'consult' | 'conference' | 'meeting';

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
export const callTargetKey = (target: LiveTransferSearchTarget) => `${target.targetType}:${digits(target.targetNumber)}`;

export function addCallTarget(
  mode: CallTargetSelectorMode,
  selected: LiveTransferSearchTarget[],
  target: LiveTransferSearchTarget,
  currentOperatorExtension = ''
): { selected: LiveTransferSearchTarget[]; error: string } {
  const allowed = mode === 'transfer' || mode === 'consult' ? target.canTransfer : target.canConference;
  if (!allowed) return { selected, error: target.disabledReason || target.transferDisabledReason || 'Цель недоступна' };
  if (mode !== 'meeting' && target.targetType === 'internal' && digits(target.targetNumber) === digits(currentOperatorExtension)) {
    return { selected, error: 'Текущий оператор уже участвует в звонке' };
  }
  if (mode === 'transfer' || mode === 'consult') return { selected: [target], error: '' };
  const key = callTargetKey(target);
  if (selected.some(item => callTargetKey(item) === key)) return { selected, error: 'Участник уже выбран' };
  return { selected: [...selected, target], error: '' };
}

export function removeCallTarget(selected: LiveTransferSearchTarget[], target: LiveTransferSearchTarget) {
  const key = callTargetKey(target);
  return selected.filter(item => callTargetKey(item) !== key);
}
