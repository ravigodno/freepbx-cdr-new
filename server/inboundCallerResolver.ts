export type InboundCallerConfidence = 'high' | 'medium' | 'low' | 'none';

export interface RejectedInboundCallerCandidate {
  value: string;
  sourceField: string;
  reason: 'internal_or_service_number' | 'did_or_trunk_number' | 'not_external_number' | 'anonymous_or_unknown' | 'technical_channel';
}

export interface InboundCallerResolution {
  externalCallerNumber: string;
  sourceField: string | null;
  confidence: InboundCallerConfidence;
  rejectedCandidates: RejectedInboundCallerCandidate[];
}

const UNKNOWN_CALLER_PATTERN = /^(?:anonymous|unknown|unavailable|restricted|private|none|null|n\/a)$/i;
const TECHNICAL_CHANNEL_PATTERN = /^(?:local|sip|pjsip|iax2)\//i;

function asRows(value: any | any[]): any[] {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

function normalizeNumber(value: string): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

function extractNumberCandidates(value: unknown): string[] {
  if (value && typeof value === 'object') {
    const objectValue = value as any;
    return extractNumberCandidates(objectValue.num ?? objectValue.number ?? objectValue.id ?? '');
  }

  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const angleNumber = raw.match(/<\s*(\+?\d{2,15})\s*>/);
  const matches = raw.match(/\+?\d{2,15}/g) || [];
  const ordered = angleNumber ? [angleNumber[1], ...matches] : matches;
  return Array.from(new Set(ordered.map(normalizeNumber).filter(Boolean)));
}

function isInboundContext(row: any): boolean {
  const context = String(row?.dcontext || row?.context || '').toLowerCase();
  return context.includes('from-trunk') || context.includes('from-pstn') || context.includes('from-did') ||
    context.includes('sip-external') || context.includes('from-digital') || context.includes('from-outside');
}

function collectTechnicalNumbers(cdrRows: any[], celRows: any[]): Set<string> {
  const values: unknown[] = [];
  for (const row of [...cdrRows, ...celRows]) {
    values.push(row?.did, row?.inboundDid, row?.trunkNumber, row?.outbound_cnum);
    if (isInboundContext(row)) values.push(row?.dst, row?.destination, row?.exten);
  }
  return new Set(values.flatMap(extractNumberCandidates).filter(number => number.length >= 7));
}

function rawFieldValue(row: any, field: string): unknown {
  if (field === 'callerid') return row?.callerid_num ?? row?.callerIdNum ?? row?.callerid;
  return row?.[field];
}

export function resolveInboundExternalCaller(
  callOrCdrChain: any | any[],
  celChain: any[] = []
): InboundCallerResolution {
  const cdrRows = asRows(callOrCdrChain);
  const celRows = asRows(celChain);
  const technicalNumbers = collectTechnicalNumbers(cdrRows, celRows);
  const rejectedCandidates: RejectedInboundCallerCandidate[] = [];
  const rejectedKeys = new Set<string>();
  let selected: Omit<InboundCallerResolution, 'rejectedCandidates'> | null = null;

  const reject = (value: string, sourceField: string, reason: RejectedInboundCallerCandidate['reason']) => {
    const key = `${value}:${sourceField}:${reason}`;
    if (rejectedKeys.has(key)) return;
    rejectedKeys.add(key);
    rejectedCandidates.push({ value, sourceField, reason });
  };

  const sources: Array<{ rows: any[]; origin: 'cel' | 'cdr'; field: string; confidence: InboundCallerConfidence }> = [
    { rows: celRows, origin: 'cel', field: 'cid_num', confidence: 'high' },
    { rows: cdrRows, origin: 'cdr', field: 'cid_num', confidence: 'high' },
    { rows: cdrRows, origin: 'cdr', field: 'cnum', confidence: 'high' },
    { rows: cdrRows, origin: 'cdr', field: 'src', confidence: 'medium' },
    { rows: celRows, origin: 'cel', field: 'callerid', confidence: 'high' },
    { rows: cdrRows, origin: 'cdr', field: 'callerid', confidence: 'medium' },
    { rows: cdrRows, origin: 'cdr', field: 'clid', confidence: 'medium' }
  ];

  for (const source of sources) {
    for (const row of source.rows) {
      const rawValue = rawFieldValue(row, source.field);
      const rawText = String(rawValue ?? '').trim();
      const sourceField = `${source.origin}.${source.field}`;

      if (rawText && UNKNOWN_CALLER_PATTERN.test(rawText)) {
        reject(rawText.toLowerCase(), sourceField, 'anonymous_or_unknown');
        continue;
      }
      if (rawText && TECHNICAL_CHANNEL_PATTERN.test(rawText)) {
        reject(rawText.slice(0, 64), sourceField, 'technical_channel');
        continue;
      }

      const candidates = extractNumberCandidates(rawValue);
      if (rawText && !candidates.length) {
        reject(rawText.slice(0, 64), sourceField, 'not_external_number');
        continue;
      }
      for (const candidate of candidates) {
        if (candidate.length <= 6) {
          reject(candidate, sourceField, 'internal_or_service_number');
          continue;
        }
        if (candidate.length > 15) {
          reject(candidate, sourceField, 'not_external_number');
          continue;
        }
        if (technicalNumbers.has(candidate)) {
          reject(candidate, sourceField, 'did_or_trunk_number');
          continue;
        }
        if (!selected) {
          selected = {
            externalCallerNumber: candidate,
            sourceField,
            confidence: source.confidence
          };
        }
      }
    }
  }

  if (selected) return { ...selected, rejectedCandidates };

  return {
    externalCallerNumber: '',
    sourceField: null,
    confidence: 'none',
    rejectedCandidates
  };
}
