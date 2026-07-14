import type { DirectoryEntry } from '../src/types.js';

export type LiveTransferPresence = 'online' | 'offline' | 'busy' | 'unavailable' | 'ringing' | 'unknown';
export type LiveTransferTargetType = 'internal' | 'directory_phone';

export interface LiveTransferSearchTarget {
  id: string;
  label: string;
  displayName: string;
  displayNumber: string;
  targetNumber: string;
  targetType: LiveTransferTargetType;
  numberLabel: string;
  extension: string;
  name: string;
  company: string;
  phone: string;
  phone2: string;
  extraPhone: string;
  department: string;
  position: string;
  comment: string;
  metadataMatches: string[];
  canTransfer: boolean;
  canCall: boolean;
  canConference: boolean;
  disabledReason: string;
  transferDisabledReason: string;
  sipStatus: LiveTransferPresence;
  deviceStatus: LiveTransferPresence;
  deviceType: string;
  source: string;
}

type DirectoryPhoneCandidate = {
  displayNumber: string;
  targetNumber: string;
  numberLabel: string;
};

const cleanText = (value: unknown): string => String(value ?? '').trim();
const normalizeText = (value: unknown): string => cleanText(value)
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е');
const digits = (value: unknown): string => cleanText(value).replace(/\D/g, '');
const isInternalExtension = (value: unknown): boolean => /^\d{2,5}$/.test(cleanText(value));

const truthyFlag = (value: unknown): boolean => {
  const text = normalizeText(value);
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(text);
};

function uniqueText(values: unknown[]): string[] {
  return Array.from(new Set(values.flatMap(value => {
    if (Array.isArray(value)) return value.map(cleanText);
    return cleanText(value).split(/[;,|\n]+/).map(part => part.trim());
  }).filter(Boolean)));
}

function getPhones(entry: DirectoryEntry | Record<string, any>): string[] {
  return uniqueText([
    entry.number,
    (entry as any).phone,
    (entry as any).phone2,
    (entry as any).extraPhone,
    Array.isArray(entry.phones) ? entry.phones : []
  ]);
}

export function getLiveTransferInternalExtension(entry: DirectoryEntry | Record<string, any>): string {
  const explicitExtension = digits(entry.internalExtension || (entry as any).extension || (entry as any).internal_number);
  if (isInternalExtension(explicitExtension)) return explicitExtension;
  if (entry.type !== 'internal') return '';
  return getPhones(entry).map(digits).find(isInternalExtension) || '';
}

export function normalizeLiveTransferDirectoryNumber(value: unknown): string {
  const valueDigits = digits(value);
  if (!/^\d{6,15}$/.test(valueDigits)) return '';
  return valueDigits.length === 11 && valueDigits.startsWith('8')
    ? `7${valueDigits.slice(1)}`
    : valueDigits;
}

function phoneVariants(value: unknown): string[] {
  const raw = digits(value);
  const normalized = raw.length === 11 && raw.startsWith('8') ? `7${raw.slice(1)}` : raw;
  const variants = [raw, normalized];
  if (raw.length === 11 && raw.startsWith('7')) variants.push(`8${raw.slice(1)}`);
  if (raw.length === 11 && raw.startsWith('8')) variants.push(`7${raw.slice(1)}`);
  return Array.from(new Set(variants.filter(Boolean)));
}

function phoneMatchRank(phones: string[], rawQuery: unknown): number {
  const queryVariants = phoneVariants(rawQuery);
  if (!queryVariants.length) return Number.POSITIVE_INFINITY;
  const candidates = phones.flatMap(phoneVariants);
  if (candidates.some(candidate => queryVariants.includes(candidate))) return 5;
  if (candidates.some(candidate => queryVariants.some(query => candidate.startsWith(query)))) return 10;
  if (candidates.some(candidate => queryVariants.some(query => candidate.includes(query)))) return 15;
  return Number.POSITIVE_INFINITY;
}

function getDirectoryPhoneCandidates(entry: DirectoryEntry | Record<string, any>, extension: string): DirectoryPhoneCandidate[] {
  const primaryPhones = getPhones(entry);
  const values: Array<{ value: unknown; label: string }> = [
    ...primaryPhones.map((value, index) => ({ value, label: index === 0 ? 'Основной телефон' : 'Доп. телефон' })),
    { value: entry.linkedExternalNumber || (entry as any).linked_external_number, label: 'Связанный номер' },
    ...uniqueText([Array.isArray((entry as any).transferPhoneNumbers) ? (entry as any).transferPhoneNumbers : []])
      .map(value => ({ value, label: 'Телефон справочника' }))
  ];
  const seen = new Set<string>();

  return values.flatMap(({ value, label }) => {
    const targetNumber = normalizeLiveTransferDirectoryNumber(value);
    if (!targetNumber || targetNumber === extension || seen.has(targetNumber)) return [];
    seen.add(targetNumber);
    return [{ displayNumber: cleanText(value), targetNumber, numberLabel: label }];
  });
}

function normalizePresence(value: unknown): LiveTransferPresence {
  const status = normalizeText(value);
  if (['online', 'available', 'registered', 'reachable', 'ok'].includes(status)) return 'online';
  if (['offline', 'unregistered'].includes(status)) return 'offline';
  if (['unavailable', 'unreachable'].includes(status)) return 'unavailable';
  if (['ringing', 'ring'].includes(status)) return 'ringing';
  if (['busy', 'inuse', 'in use', 'in-use'].includes(status)) return 'busy';
  return 'unknown';
}

function getMetadataMatches(entry: DirectoryEntry | Record<string, any>, query: string, rawQuery: unknown): string[] {
  if (!query) return [];
  const queryHasDigits = digits(rawQuery).length > 0;
  return uniqueText([Array.isArray((entry as any).searchMetadata) ? (entry as any).searchMetadata : []])
    .filter(value => normalizeText(value).includes(query) || (queryHasDigits && Number.isFinite(phoneMatchRank([value], rawQuery))))
    .slice(0, 5);
}

function rankEntry(entry: DirectoryEntry | Record<string, any>, rawQuery: unknown, extension: string): number {
  const query = normalizeText(rawQuery);
  const queryDigits = digits(rawQuery);
  if (!query) return extension ? 50 : 60;
  if (queryDigits && extension === queryDigits) return 0;

  const phoneRank = phoneMatchRank(uniqueText([
    extension,
    getPhones(entry),
    entry.linkedExternalNumber,
    Array.isArray((entry as any).transferPhoneNumbers) ? (entry as any).transferPhoneNumbers : []
  ]), rawQuery);
  if (Number.isFinite(phoneRank)) return phoneRank;

  const name = normalizeText(entry.name);
  if (name === query) return 20;
  if (name.startsWith(query)) return 25;
  if (name.split(/\s+/).some(part => part.startsWith(query))) return 30;
  if (name.includes(query)) return 35;

  const organizationText = normalizeText([
    entry.company,
    (entry as any).organization,
    (entry as any).firstName,
    (entry as any).lastName,
    (entry as any).surname,
    entry.department,
    entry.position,
    entry.group,
    entry.comment,
    ...(Array.isArray(entry.tags) ? entry.tags : [])
  ].filter(Boolean).join(' '));
  if (organizationText.includes(query)) return 40;
  return getMetadataMatches(entry, query, rawQuery).length ? 50 : Number.POSITIVE_INFINITY;
}

function rankTargetOption(target: LiveTransferSearchTarget, rawQuery: unknown, entryRank: number): number {
  const queryDigits = digits(rawQuery);
  if (!queryDigits) return entryRank;
  if (target.targetType === 'internal' && target.targetNumber === queryDigits) return 0;
  const targetPhoneRank = phoneMatchRank([target.targetNumber], rawQuery);
  return Number.isFinite(targetPhoneRank) ? targetPhoneRank : Math.max(entryRank, 18);
}

function numberLabelRank(value: string): number {
  if (value === 'Основной телефон') return 0;
  if (value === 'Доп. телефон') return 1;
  if (value === 'Связанный номер') return 2;
  return 3;
}

export function buildLiveTransferTargetOptions(
  entry: DirectoryEntry | Record<string, any>,
  rawExcludeExtension: unknown,
  allowExternalDirectoryNumbers = true,
  source = 'directory'
): LiveTransferSearchTarget[] {
  if (truthyFlag(entry?.isSpam) || truthyFlag(entry?.isBlacklisted)
    || truthyFlag((entry as any)?.disabled) || truthyFlag((entry as any)?.hidden)) return [];

  const excludeExtension = digits(rawExcludeExtension);
  const extension = getLiveTransferInternalExtension(entry);
  const phoneCandidates = getDirectoryPhoneCandidates(entry, extension);
  const displayName = cleanText(entry.name || entry.company || 'Контакт').slice(0, 160);
  const company = cleanText(entry.company || (entry as any).organization).slice(0, 160);
  const sourceName = cleanText((entry as any).source) || source;
  const common = {
    id: cleanText(entry.id) || extension || displayName,
    name: displayName,
    displayName,
    company,
    phone: cleanText(phoneCandidates[0]?.displayNumber).slice(0, 80),
    phone2: cleanText(phoneCandidates[1]?.displayNumber).slice(0, 80),
    extraPhone: cleanText(phoneCandidates.slice(1).map(item => item.displayNumber).join(', ')).slice(0, 160),
    department: cleanText(entry.department || entry.group).slice(0, 120),
    position: cleanText(entry.position).slice(0, 120),
    comment: cleanText(entry.comment).slice(0, 200),
    metadataMatches: [] as string[],
    sipStatus: normalizePresence((entry as any).sipStatus),
    deviceStatus: normalizePresence((entry as any).deviceStatus),
    deviceType: cleanText((entry as any).deviceType || (entry as any).sipType || (entry as any).technology).slice(0, 80),
    source: sourceName
  };
  const targets: LiveTransferSearchTarget[] = [];

  if (extension) {
    const canTransfer = extension !== excludeExtension;
    targets.push({
      ...common,
      label: displayName,
      displayNumber: extension,
      targetNumber: extension,
      targetType: 'internal',
      numberLabel: 'Внутренний номер',
      extension,
      canTransfer,
      canCall: canTransfer,
      canConference: canTransfer,
      disabledReason: canTransfer ? '' : 'Текущий оператор уже участвует в звонке',
      transferDisabledReason: canTransfer ? '' : 'Нельзя перевести звонок на текущий внутренний номер'
    });
  }

  for (const phone of phoneCandidates) {
    targets.push({
      ...common,
      label: displayName,
      displayNumber: phone.displayNumber,
      targetNumber: phone.targetNumber,
      targetType: 'directory_phone',
      numberLabel: phone.numberLabel,
      extension,
      canTransfer: allowExternalDirectoryNumbers,
      canCall: allowExternalDirectoryNumbers,
      canConference: allowExternalDirectoryNumbers,
      disabledReason: allowExternalDirectoryNumbers ? '' : 'Звонки на номера справочника отключены',
      transferDisabledReason: allowExternalDirectoryNumbers ? '' : 'Перевод на номера справочника отключён'
    });
  }

  if (!targets.length) {
    targets.push({
      ...common,
      label: displayName,
      displayNumber: '',
      targetNumber: '',
      targetType: 'directory_phone',
      numberLabel: 'Номер справочника',
      extension: '',
      canTransfer: false,
      canCall: false,
      canConference: false,
      disabledReason: 'Нет допустимого номера для звонка',
      transferDisabledReason: 'Нет допустимого номера для переадресации'
    });
  }

  return targets;
}

export function rankLiveTransferTargets(
  entries: Array<DirectoryEntry | Record<string, any>>,
  rawQuery: unknown,
  rawExcludeExtension: unknown,
  rawLimit = 50,
  source = 'directory',
  allowExternalDirectoryNumbers = true
): LiveTransferSearchTarget[] {
  const query = normalizeText(rawQuery);
  const limit = Math.max(1, Math.min(50, Number(rawLimit) || 50));
  const seen = new Set<string>();

  return (entries || [])
    .flatMap(entry => {
      const extension = getLiveTransferInternalExtension(entry);
      const rank = rankEntry(entry, rawQuery, extension);
      if (!Number.isFinite(rank)) return [];
      return buildLiveTransferTargetOptions(entry, rawExcludeExtension, allowExternalDirectoryNumbers, source)
        .map(target => ({ entry, target, rank: rankTargetOption(target, rawQuery, rank) }));
    })
    .filter(({ target }) => {
      const key = `${target.id}:${target.targetType}:${target.targetNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.rank - b.rank
      || (a.target.targetType === b.target.targetType ? 0 : a.target.targetType === 'internal' ? -1 : 1)
      || Number(b.target.canTransfer) - Number(a.target.canTransfer)
      || numberLabelRank(a.target.numberLabel) - numberLabelRank(b.target.numberLabel)
      || a.target.targetNumber.localeCompare(b.target.targetNumber, 'ru', { numeric: true })
      || normalizeText(a.entry.name).localeCompare(normalizeText(b.entry.name), 'ru'))
    .slice(0, limit)
    .map(({ entry, target }) => ({
      ...target,
      metadataMatches: getMetadataMatches(entry, query, rawQuery)
    }));
}
