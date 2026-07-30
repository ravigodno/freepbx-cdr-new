import fetch from 'node-fetch';

export type MtsAutoSecretaryDirection = 'inbound' | 'outbound';

export interface MtsAutoSecretaryConfig {
  enabled: boolean;
  apiKey: string;
  phone: string;
  timeoutMs: number;
}

export interface MtsAutoSecretaryCall {
  id: string;
  seqId: string;
  profileId: string;
  branchName: string;
  pbxName: string;
  direction: MtsAutoSecretaryDirection;
  startedAt: string | null;
  universalNumber: string | null;
  callerNumber: string | null;
  connectedNumber: string | null;
  durationSeconds: number;
  talkDurationSeconds: number;
  recordDurationSeconds: number;
  result: number | string | null;
  subResult: number | string | null;
  statusLabel: string;
  attempts: Array<{ number: string | null; result: number | string | null; resultLabel: string | null }>;
  journey: MtsAutoSecretaryJourneyEvent[];
  outcomeCategory: MtsAutoSecretaryOutcomeCategory;
  recordingAvailable: boolean;
}

export type MtsAutoSecretaryOutcomeCategory = 'connected' | 'no_connection' | 'technical_error' | 'routing' | 'unknown';

export interface MtsAutoSecretaryJourneyEvent {
  code: string;
  label: string;
  number: string | null;
}

export class MtsAutoSecretaryProviderError extends Error {
  constructor(public readonly safeCode: string) {
    super(safeCode);
  }
}

export function normalizeMtsAutoSecretaryPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && ['7', '8'].includes(digits[0])) return digits.slice(1);
  return '';
}

const boundedInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const finiteInteger = (value: unknown) => {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalValue = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const JOURNEY_TOKENS: Array<{
  pattern: RegExp;
  code: string;
  label: string;
  category: MtsAutoSecretaryOutcomeCategory;
}> = [
  { pattern: /\bConn\b/i, code: 'connected', label: 'Соединение установлено', category: 'connected' },
  { pattern: /\bNoAnswer\b/i, code: 'no_answer', label: 'Нет ответа', category: 'no_connection' },
  { pattern: /\bACBusy(?:\([^)]*\))?/i, code: 'acoustic_busy', label: 'Сигнал «занято»', category: 'no_connection' },
  { pattern: /\bBusy(?:\([^)]*\))?/i, code: 'busy', label: 'Номер занят', category: 'no_connection' },
  { pattern: /\bHgUp_DurMC\b/i, code: 'cancelled_during_dial', label: 'Звонящий завершил вызов во время дозвона', category: 'no_connection' },
  { pattern: /\bNo_AvDNS\b/i, code: 'no_free_destinations', label: 'Нет свободных номеров назначения', category: 'no_connection' },
  { pattern: /\bNO_DNS\b/i, code: 'no_destinations', label: 'Нет активных номеров назначения', category: 'no_connection' },
  { pattern: /\bNoChannels\b/i, code: 'no_channels', label: 'Нет свободных каналов', category: 'technical_error' },
  { pattern: /\bMaxQueueExceeded\b/i, code: 'queue_limit', label: 'Превышен лимит одновременных звонков', category: 'technical_error' },
  { pattern: /\bLimit_Exceeded\b/i, code: 'insufficient_balance', label: 'Недостаточно средств', category: 'technical_error' },
  { pattern: /\bBilling_Account_Error\b/i, code: 'billing_account_error', label: 'Проблема учётной записи', category: 'technical_error' },
  { pattern: /\b(?:CRM_ErrP|CRM_ErrG)(?:\([^)]*\))?/i, code: 'crm_error', label: 'Ошибка CRM', category: 'technical_error' },
  { pattern: /\bException\b/i, code: 'system_error', label: 'Системная ошибка', category: 'technical_error' },
  { pattern: /\bTrfCallOK\b/i, code: 'transfer_complete', label: 'Перевод выполнен', category: 'routing' },
  { pattern: /\bTrf_Fail\b/i, code: 'transfer_failed', label: 'Ошибка перевода', category: 'technical_error' },
  { pattern: /\bMenuEnd\b/i, code: 'menu_complete', label: 'Действие голосового меню завершено', category: 'routing' },
  { pattern: /\bRec_Start\b/i, code: 'recording_started', label: 'Запись разговора начата', category: 'routing' },
  { pattern: /\bRec_Stop\b/i, code: 'recording_stopped', label: 'Запись разговора завершена', category: 'routing' }
];

const NUMBER_JOURNEY_TOKENS = [
  { pattern: /\bTryToCall:([+\d][\d]*)/gi, code: 'dial_attempt', label: 'Попытка дозвона' },
  { pattern: /\bCallTo-([+\d][\d]*)/gi, code: 'transfer_to', label: 'Перевод на номер' },
  { pattern: /\bOpIn-([+\d][\d]*)/gi, code: 'operator_transfer', label: 'Оператор выбрал номер' },
  { pattern: /\bExtension-([+\d][\d]*)/gi, code: 'extension', label: 'Набран внутренний номер' }
];

export function decodeMtsAutoSecretaryLog(value: unknown): {
  journey: MtsAutoSecretaryJourneyEvent[];
  fallbackNumbers: string[];
  outcomeCategory: MtsAutoSecretaryOutcomeCategory;
} {
  const log = String(value ?? '');
  if (!log) return { journey: [], fallbackNumbers: [], outcomeCategory: 'unknown' };
  const journey: MtsAutoSecretaryJourneyEvent[] = [];
  const categories: MtsAutoSecretaryOutcomeCategory[] = [];
  for (const token of JOURNEY_TOKENS) {
    if (!token.pattern.test(log)) continue;
    journey.push({ code: token.code, label: token.label, number: null });
    categories.push(token.category);
  }
  const fallbackNumbers = new Set<string>();
  for (const token of NUMBER_JOURNEY_TOKENS) {
    token.pattern.lastIndex = 0;
    for (const match of log.matchAll(token.pattern)) {
      const number = optionalValue(match[1]);
      if (!number) continue;
      fallbackNumbers.add(number);
      journey.push({ code: token.code, label: token.label, number });
    }
  }
  const menuMatch = log.match(/\bMnCh-(10|[0-9])\b/i);
  if (menuMatch) journey.push({
    code: 'menu_choice',
    label: menuMatch[1] === '10' ? 'Меню: нет выбора' : `Выбран пункт меню ${menuMatch[1]}`,
    number: null
  });
  const outcomeCategory: MtsAutoSecretaryOutcomeCategory = categories.includes('connected')
    ? 'connected'
    : categories.includes('technical_error')
      ? 'technical_error'
      : categories.includes('no_connection')
        ? 'no_connection'
        : journey.length > 0 ? 'routing' : 'unknown';
  return { journey, fallbackNumbers: [...fallbackNumbers], outcomeCategory };
}

export function mtsAutoSecretaryStatusLabel(direction: MtsAutoSecretaryDirection, result: unknown, subResult: unknown): string {
  const code = Number(subResult);
  if (direction === 'inbound') {
    const labels: Record<number, string> = {
      0: 'Соединён',
      1: 'Номер заблокирован',
      2: 'Завершён после приветствия',
      3: 'Недостаточно средств',
      4: 'Системное меню',
      5: 'Нет доступных номеров',
      6: 'Нет свободных каналов',
      7: 'Запрещён правилами',
      100: 'Конференция',
      [-3]: 'Завершён в очереди',
      [-2]: 'Завершён до очереди',
      [-1]: 'Не определён'
    };
    if (Number.isFinite(code) && labels[code]) return labels[code];
  }
  const resultCode = Number(result);
  if (resultCode === 0 || resultCode === 1280) return 'Соединён';
  if (resultCode === 1284) return 'Завершён во время дозвона';
  const sipResult = mtsAutoSecretarySipResult(result);
  if (sipResult) return sipResult.label;
  const resultText = optionalValue(result);
  return resultText ? `Неизвестный код ${resultText}` : 'Не определён';
}

export function mtsAutoSecretarySipResult(result: unknown): {
  label: string;
  category: MtsAutoSecretaryOutcomeCategory;
} | null {
  const labels: Record<number, { label: string; category: MtsAutoSecretaryOutcomeCategory }> = {
    401: { label: 'Ошибка авторизации SIP', category: 'technical_error' },
    403: { label: 'Вызов запрещён SIP-сервером', category: 'technical_error' },
    404: { label: 'Вызываемая сторона не найдена', category: 'no_connection' },
    408: { label: 'Тайм-аут SIP или сети', category: 'technical_error' },
    480: { label: 'Абонент временно недоступен', category: 'no_connection' },
    486: { label: 'Абонент занят', category: 'no_connection' },
    487: { label: 'Вызов отменён', category: 'no_connection' },
    500: { label: 'Внутренняя ошибка SIP-сервера', category: 'technical_error' },
    502: { label: 'Ошибка SIP-шлюза', category: 'technical_error' },
    503: { label: 'SIP-сервис недоступен', category: 'technical_error' }
  };
  const code = Number(result);
  return Number.isInteger(code) ? labels[code] || null : null;
}

function responseItems(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const value: any = payload;
  for (const key of ['items', 'data', 'cdrs', 'result']) {
    if (Array.isArray(value[key])) return value[key];
  }
  return value.seqId !== undefined ? [value] : [];
}

export function normalizeMtsAutoSecretaryCalls(
  payload: unknown,
  direction: MtsAutoSecretaryDirection,
  profile: { id: string; branchName: string; pbxName: string } = { id: 'default', branchName: '', pbxName: '' }
): MtsAutoSecretaryCall[] {
  const seen = new Set<string>();
  return responseItems(payload).flatMap((row: any, index) => {
    const seqId = String(row?.seqId ?? row?.seqID ?? '').trim();
    if (!seqId || seen.has(seqId)) return [];
    seen.add(seqId);
    const attempts = Array.isArray(row?.outbounds)
      ? row.outbounds.map((attempt: any) => {
          const decodedResult = mtsAutoSecretarySipResult(attempt?.result);
          return {
            number: optionalValue(attempt?.bn),
            result: attempt?.result ?? null,
            resultLabel: decodedResult?.label || null
          };
        })
      : [];
    const decodedLog = decodeMtsAutoSecretaryLog(row?.log);
    const recordDurationSeconds = Math.max(0, finiteInteger(row?.recDuration));
    const talkDurationSeconds = Math.max(0, finiteInteger(row?.talkDuration));
    const attemptOutcomes = attempts
      .map(attempt => mtsAutoSecretarySipResult(attempt.result))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const attemptCategory: MtsAutoSecretaryOutcomeCategory = attemptOutcomes.some(item => item.category === 'technical_error')
      ? 'technical_error' : attemptOutcomes.some(item => item.category === 'no_connection') ? 'no_connection' : 'unknown';
    const outcomeCategory = decodedLog.outcomeCategory !== 'unknown'
      ? decodedLog.outcomeCategory
      : talkDurationSeconds > 0 ? 'connected' : attemptCategory;
    const journey = [...decodedLog.journey];
    for (const attempt of attempts) {
      if (attempt.resultLabel && !journey.some(event => event.label === attempt.resultLabel && event.number === attempt.number)) {
        journey.push({ code: `sip_${attempt.result}`, label: attempt.resultLabel, number: attempt.number });
      }
    }
    return [{
      id: `mts-aa:${profile.id}:${direction}:${seqId || index}`,
      seqId,
      profileId: profile.id,
      branchName: profile.branchName,
      pbxName: profile.pbxName,
      direction,
      startedAt: optionalValue(row?.startTime),
      universalNumber: optionalValue(row?.un),
      callerNumber: optionalValue(row?.an),
      connectedNumber: optionalValue(row?.cn),
      durationSeconds: Math.max(0, finiteInteger(row?.duration)),
      talkDurationSeconds,
      recordDurationSeconds,
      result: row?.result ?? null,
      subResult: row?.subResult ?? null,
      statusLabel: mtsAutoSecretaryStatusLabel(direction, row?.result, row?.subResult),
      attempts,
      journey,
      outcomeCategory,
      recordingAvailable: recordDurationSeconds > 0
    }];
  });
}

export class MtsAutoSecretaryProvider {
  readonly enabled: boolean;
  readonly configured: boolean;
  private readonly phone: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: MtsAutoSecretaryConfig) {
    this.enabled = config.enabled === true;
    this.apiKey = String(config.apiKey || '').trim();
    this.phone = normalizeMtsAutoSecretaryPhone(config.phone);
    this.timeoutMs = boundedInteger(config.timeoutMs, 15000, 1000, 60000);
    this.configured = Boolean(this.apiKey && this.phone);
  }

  private async request(path: string, params: URLSearchParams): Promise<unknown> {
    if (!this.enabled) throw new MtsAutoSecretaryProviderError('provider_disabled');
    if (!this.configured) throw new MtsAutoSecretaryProviderError('provider_not_configured');
    const url = new URL(`https://aa.mts.ru/api/v5${path}`);
    url.search = params.toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Api-Key ${this.apiKey}`, Accept: 'application/json' },
        redirect: 'manual',
        signal: controller.signal
      });
      if (response.status >= 300 && response.status < 400) throw new MtsAutoSecretaryProviderError('redirect_blocked');
      if ([401, 403].includes(response.status)) throw new MtsAutoSecretaryProviderError('authentication_failed');
      if (!response.ok) throw new MtsAutoSecretaryProviderError(`cdr_http_${response.status}`);
      if (response.status === 204) return [];
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('json')) throw new MtsAutoSecretaryProviderError('invalid_content_type');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 10 * 1024 * 1024) throw new MtsAutoSecretaryProviderError('response_too_large');
      try { return JSON.parse(text); } catch { throw new MtsAutoSecretaryProviderError('invalid_json'); }
    } catch (error: any) {
      if (error instanceof MtsAutoSecretaryProviderError) throw error;
      if (error?.name === 'AbortError') throw new MtsAutoSecretaryProviderError('timeout');
      throw new MtsAutoSecretaryProviderError('network_error');
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchCalls(
    direction: MtsAutoSecretaryDirection,
    begin: string,
    end: string,
    limit = 500,
    offset = 0,
    profile: { id: string; branchName: string; pbxName: string } = { id: 'default', branchName: '', pbxName: '' }
  ): Promise<MtsAutoSecretaryCall[]> {
    const params = new URLSearchParams({
      Phone: this.phone,
      Begin: begin,
      End: end,
      Limit: String(boundedInteger(limit, 500, 1, 200000)),
      Offset: String(Math.max(0, finiteInteger(offset)))
    });
    if (direction === 'inbound') params.set('includeOutbounds', 'true');
    const path = direction === 'inbound' ? '/cdr/getbytime' : '/cdr/getbytimeoutpaging';
    return normalizeMtsAutoSecretaryCalls(await this.request(path, params), direction, profile);
  }
}
