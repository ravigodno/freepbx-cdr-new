import type { DirectoryEntry } from '../src/types.js';

export type LiveTransferPresence = 'online' | 'offline' | 'busy' | 'unknown';

export interface LiveTransferSearchTarget {
  id: string;
  extension: string;
  name: string;
  company: string;
  phone: string;
  extraPhone: string;
  department: string;
  position: string;
  comment: string;
  metadataMatches: string[];
  canTransfer: boolean;
  transferDisabledReason: string;
  sipStatus: LiveTransferPresence;
  deviceStatus: LiveTransferPresence;
  deviceType: string;
  source: string;
}

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

function normalizePhone(value: unknown): string {
  const valueDigits = digits(value);
  return valueDigits.length === 11 && valueDigits.startsWith('8')
    ? `7${valueDigits.slice(1)}`
    : valueDigits;
}

function phoneVariants(value: unknown): string[] {
  const raw = digits(value);
  const normalized = normalizePhone(value);
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

function normalizePresence(value: unknown): LiveTransferPresence {
  const status = normalizeText(value);
  if (['online', 'available', 'registered', 'reachable', 'ok'].includes(status)) return 'online';
  if (['offline', 'unavailable', 'unregistered', 'unreachable'].includes(status)) return 'offline';
  if (['busy', 'inuse', 'in use', 'ringing'].includes(status)) return 'busy';
  return 'unknown';
}

function getMetadataMatches(entry: DirectoryEntry | Record<string, any>, query: string, rawQuery: unknown): string[] {
  if (!query) return [];
  const queryHasDigits = digits(rawQuery).length > 0;
  return uniqueText([Array.isArray((entry as any).searchMetadata) ? (entry as any).searchMetadata : []])
    .filter(value => normalizeText(value).includes(query) || (queryHasDigits && Number.isFinite(phoneMatchRank([value], rawQuery))))
    .slice(0, 5);
}

function rankTarget(entry: DirectoryEntry | Record<string, any>, rawQuery: unknown, extension: string): number {
  const query = normalizeText(rawQuery);
  const queryDigits = digits(rawQuery);
  if (!query) return extension ? 50 : 60;
  if (queryDigits && extension === queryDigits) return 0;

  const phoneRank = phoneMatchRank(uniqueText([extension, getPhones(entry)]), rawQuery);
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

export function rankLiveTransferTargets(
  entries: Array<DirectoryEntry | Record<string, any>>,
  rawQuery: unknown,
  rawExcludeExtension: unknown,
  rawLimit = 50,
  source = 'directory'
): LiveTransferSearchTarget[] {
  const query = normalizeText(rawQuery);
  const excludeExtension = digits(rawExcludeExtension);
  const limit = Math.max(1, Math.min(50, Number(rawLimit) || 50));
  const seen = new Set<string>();

  return (entries || [])
    .filter(entry => !truthyFlag(entry?.isSpam) && !truthyFlag(entry?.isBlacklisted))
    .filter(entry => !truthyFlag((entry as any)?.disabled) && !truthyFlag((entry as any)?.hidden))
    .map(entry => {
      const extension = getLiveTransferInternalExtension(entry);
      const canTransfer = Boolean(extension && extension !== excludeExtension);
      const rank = rankTarget(entry, rawQuery, extension);
      return { entry, extension, canTransfer, rank };
    })
    .filter(item => {
      const id = cleanText(item.entry.id) || `${normalizeText(item.entry.name)}:${getPhones(item.entry).join(',')}`;
      if (!Number.isFinite(item.rank) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => a.rank - b.rank
      || Number(b.canTransfer) - Number(a.canTransfer)
      || a.extension.localeCompare(b.extension, 'ru', { numeric: true })
      || normalizeText(a.entry.name).localeCompare(normalizeText(b.entry.name), 'ru'))
    .slice(0, limit)
    .map(({ entry, extension, canTransfer }) => {
      const phones = getPhones(entry);
      return {
        id: cleanText(entry.id) || extension || cleanText(entry.name),
        extension,
        name: cleanText(entry.name || entry.company || 'Контакт').slice(0, 160),
        company: cleanText(entry.company || (entry as any).organization).slice(0, 160),
        phone: cleanText(phones[0]).slice(0, 80),
        extraPhone: cleanText(phones.slice(1).join(', ')).slice(0, 160),
        department: cleanText(entry.department || entry.group).slice(0, 120),
        position: cleanText(entry.position).slice(0, 120),
        comment: cleanText(entry.comment).slice(0, 200),
        metadataMatches: getMetadataMatches(entry, query, rawQuery),
        canTransfer,
        transferDisabledReason: canTransfer
          ? ''
          : extension === excludeExtension && extension
            ? 'Нельзя перевести звонок на текущий внутренний номер'
            : 'Нет внутреннего номера для переадресации',
        sipStatus: normalizePresence((entry as any).sipStatus),
        deviceStatus: normalizePresence((entry as any).deviceStatus),
        deviceType: cleanText((entry as any).deviceType || (entry as any).sipType || (entry as any).technology).slice(0, 80),
        source: cleanText((entry as any).source) || source
      };
    });
}
