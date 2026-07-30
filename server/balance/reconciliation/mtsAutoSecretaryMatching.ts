import type { MtsAutoSecretaryCall } from '../providers/mtsAutoSecretary.js';

export type MtsAutoSecretaryMatchConfidence = 'exact' | 'likely' | 'conflict' | 'unmatched';

export interface MtsBusinessCallCandidate {
  id: number;
  occurredAt: string;
  direction: 'incoming' | 'outgoing';
  callerNumber: string | null;
  calleeNumber: string | null;
  amount: number | null;
  actualUnits: number | null;
  billedUnits: number | null;
  billedUnitCode: string | null;
  packageCounterBefore: number | null;
  packageCounterAfter: number | null;
  packageCounterUsed: number | null;
  actualUnitCode: string | null;
  label: string | null;
  mavAmount?: number;
  markingAmount?: number;
}

export interface MtsAutoSecretaryMatchedCall extends MtsAutoSecretaryCall {
  match: {
    confidence: MtsAutoSecretaryMatchConfidence;
    usageEventId: number | null;
    score: number;
    timeDifferenceSeconds: number | null;
    durationDifferenceSeconds: number | null;
    amount: number | null;
    packageCounterBefore: number | null;
    packageCounterAfter: number | null;
    packageCounterUsed: number | null;
    packageUnit: string | null;
    label: string | null;
    mavAmount: number;
    markingAmount: number;
    totalAmount: number | null;
    mtsDurationSeconds: number | null;
    additionalCharges: Array<{
      type: 'mav' | 'marking';
      operator: string;
      label: string;
      amount: number;
      taxAmount: number;
      occurredAt: string;
      ratedAt: string | null;
    }>;
    reasons: string[];
    explanation: string;
  };
}

function unmatchedExplanation(call: MtsAutoSecretaryCall, conflict: boolean): string {
  if (conflict) return 'Конфликт нескольких начислений';
  if (call.outcomeCategory === 'technical_error') {
    const reason = call.journey.find(event => [
      'no_channels', 'queue_limit', 'insufficient_balance', 'billing_account_error',
      'crm_error', 'system_error', 'transfer_failed'
    ].includes(event.code) || event.code.startsWith('sip_'));
    return reason ? `Техническая ошибка: ${reason.label}` : 'Техническая ошибка';
  }
  if (call.outcomeCategory === 'no_connection' || call.talkDurationSeconds <= 0) {
    const reason = call.journey.find(event => [
      'no_answer', 'busy', 'acoustic_busy', 'cancelled_during_dial',
      'no_free_destinations', 'no_destinations'
    ].includes(event.code) || event.code.startsWith('sip_'));
    return reason ? `Не тарифицировался: ${reason.label}` : 'Не тарифицировался: нет соединения';
  }
  return 'Нет строки в MTS Business';
}

export function normalizeCallNumber(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && ['7', '8'].includes(digits[0])) return digits.slice(1);
  if (digits.length === 10) return digits;
  return digits;
}

function epoch(value: unknown): number | null {
  const parsed = Date.parse(String(value || '').replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : null;
}

function callNumbers(call: MtsAutoSecretaryCall): Set<string> {
  return new Set([
    call.direction === 'inbound' ? call.callerNumber : call.connectedNumber,
    call.callerNumber,
    call.connectedNumber,
    ...call.attempts.map(attempt => attempt.number)
  ].map(normalizeCallNumber).filter((value): value is string => Boolean(value)));
}

function outboundAttemptNumbers(call: MtsAutoSecretaryCall): Set<string> {
  return new Set(call.attempts
    .map(attempt => normalizeCallNumber(attempt.number))
    .filter((value): value is string => Boolean(value)));
}

function candidateNumber(candidate: MtsBusinessCallCandidate): string | null {
  return normalizeCallNumber(candidate.direction === 'incoming' ? candidate.callerNumber : candidate.calleeNumber);
}

function scoreCandidate(call: MtsAutoSecretaryCall, candidate: MtsBusinessCallCandidate) {
  const expectedDirection = call.direction === 'inbound' ? 'incoming' : 'outgoing';
  const number = candidateNumber(candidate);
  if (!number || !callNumbers(call).has(number)) return null;
  const directDirection = candidate.direction === expectedDirection;
  const redirectedInbound = call.direction === 'inbound'
    && candidate.direction === 'outgoing'
    && outboundAttemptNumbers(call).has(number);
  if (!directDirection && !redirectedInbound) return null;
  const callTime = epoch(call.startedAt);
  const candidateTime = epoch(candidate.occurredAt);
  if (callTime === null || candidateTime === null) return null;
  const timeDifferenceSeconds = Math.round(Math.abs(callTime - candidateTime) / 1000);
  if (timeDifferenceSeconds > 120) return null;

  let score = 50;
  const reasons = ['номер'];
  if (directDirection) {
    score += 20;
    reasons.push('направление');
  } else {
    score += 18;
    reasons.push('исходящее плечо переадресации');
  }
  if (timeDifferenceSeconds === 0) score += 25;
  else if (timeDifferenceSeconds <= 15) score += 20;
  else if (timeDifferenceSeconds <= 60) score += 14;
  else score += 7;
  reasons.push(`время ±${timeDifferenceSeconds} с`);

  const businessDuration = Number(candidate.actualUnits);
  const autoDuration = Number(call.talkDurationSeconds);
  const durationDifferenceSeconds = Number.isFinite(businessDuration) && businessDuration >= 0
    ? Math.round(Math.abs(businessDuration - autoDuration)) : null;
  if (durationDifferenceSeconds !== null) {
    if (durationDifferenceSeconds > 30) return null;
    if (durationDifferenceSeconds <= 3) score += 10;
    else if (durationDifferenceSeconds <= 10) score += 7;
    else if (durationDifferenceSeconds <= 30) score += 3;
    if (durationDifferenceSeconds <= 30) reasons.push(`длительность ±${durationDifferenceSeconds} с`);
  }
  return { candidate, score, timeDifferenceSeconds, durationDifferenceSeconds, reasons };
}

export function matchMtsAutoSecretaryCalls(
  calls: MtsAutoSecretaryCall[],
  candidates: MtsBusinessCallCandidate[]
): MtsAutoSecretaryMatchedCall[] {
  const used = new Set<number>();
  return calls.map(call => {
    const ranked = candidates
      .filter(candidate => !used.has(candidate.id))
      .map(candidate => scoreCandidate(call, candidate))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.score - left.score || left.timeDifferenceSeconds - right.timeDifferenceSeconds);
    const best = ranked[0];
    const second = ranked[1];
    const durationTie = Boolean(best && second && (
      (best.durationDifferenceSeconds === null && second.durationDifferenceSeconds === null)
      || (best.durationDifferenceSeconds !== null && second.durationDifferenceSeconds !== null
        && Math.abs(best.durationDifferenceSeconds - second.durationDifferenceSeconds) <= 3)
    ));
    const conflict = Boolean(best && second
      && best.score - second.score <= 1
      && Math.abs(best.timeDifferenceSeconds - second.timeDifferenceSeconds) <= 5
      && durationTie);
    if (!best || best.score < 75 || conflict) {
      return {
        ...call,
        match: {
          confidence: conflict ? 'conflict' : 'unmatched',
          usageEventId: null,
          score: best?.score || 0,
          timeDifferenceSeconds: best?.timeDifferenceSeconds ?? null,
          durationDifferenceSeconds: best?.durationDifferenceSeconds ?? null,
          amount: null,
          packageCounterBefore: null,
          packageCounterAfter: null,
          packageCounterUsed: null,
          packageUnit: null,
          label: null,
          mavAmount: 0,
          markingAmount: 0,
          totalAmount: null,
          mtsDurationSeconds: null,
          additionalCharges: [],
          reasons: conflict ? ['несколько равнозначных кандидатов'] : [],
          explanation: unmatchedExplanation(call, conflict)
        }
      };
    }
    used.add(best.candidate.id);
    return {
      ...call,
      match: {
        confidence: best.score >= 97 ? 'exact' : 'likely',
        usageEventId: best.candidate.id,
        score: best.score,
        timeDifferenceSeconds: best.timeDifferenceSeconds,
        durationDifferenceSeconds: best.durationDifferenceSeconds,
        amount: best.candidate.amount,
        packageCounterBefore: best.candidate.packageCounterBefore,
        packageCounterAfter: best.candidate.packageCounterAfter,
        packageCounterUsed: best.candidate.packageCounterUsed,
        packageUnit: best.candidate.billedUnitCode || best.candidate.actualUnitCode,
        label: best.candidate.label,
        mavAmount: Number(best.candidate.mavAmount) || 0,
        markingAmount: Number(best.candidate.markingAmount) || 0,
        totalAmount: (best.candidate.amount || 0)
          + (Number(best.candidate.mavAmount) || 0) + (Number(best.candidate.markingAmount) || 0),
        mtsDurationSeconds: best.candidate.actualUnits,
        additionalCharges: [],
        reasons: best.reasons,
        explanation: best.score >= 97 ? 'Сопоставлено точно' : 'Сопоставлено вероятно'
      }
    };
  });
}
