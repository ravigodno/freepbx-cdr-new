import type { DirectoryEntry } from '../src/types.js';

export type LiveTransferPresence = 'online' | 'offline' | 'busy' | 'unknown';

export interface LiveTransferSearchTarget {
  id: string;
  extension: string;
  name: string;
  department: string;
  position: string;
  comment: string;
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
const isInternalExtension = (value: unknown): boolean => {
  const extension = digits(value);
  return extension.length >= 2 && extension.length <= 5;
};

const truthyFlag = (value: unknown): boolean => {
  const text = normalizeText(value);
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(text);
};

function getInternalExtension(entry: DirectoryEntry | Record<string, any>): string {
  const candidates = [
    entry.internalExtension,
    entry.number,
    ...(Array.isArray(entry.phones) ? entry.phones : [])
  ];
  return candidates.map(digits).find(isInternalExtension) || '';
}

function normalizePresence(value: unknown): LiveTransferPresence {
  const status = normalizeText(value);
  if (['online', 'available', 'registered', 'reachable', 'ok'].includes(status)) return 'online';
  if (['offline', 'unavailable', 'unregistered', 'unreachable'].includes(status)) return 'offline';
  if (['busy', 'inuse', 'in use', 'ringing'].includes(status)) return 'busy';
  return 'unknown';
}

function buildSearchText(entry: DirectoryEntry | Record<string, any>, extension: string): string {
  return normalizeText([
    extension,
    entry.name,
    entry.company,
    entry.department,
    entry.position,
    entry.group,
    entry.comment,
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.searchMetadata) ? entry.searchMetadata : [])
  ].filter(Boolean).join(' '));
}

function rankTarget(entry: DirectoryEntry | Record<string, any>, query: string, queryDigits: string, extension: string): number {
  if (!query) return 50;
  if (queryDigits && extension === queryDigits) return 0;
  if (queryDigits && extension.startsWith(queryDigits)) return 10;
  if (queryDigits && extension.includes(queryDigits)) return 20;

  const name = normalizeText(entry.name);
  if (name === query) return 25;
  if (name.startsWith(query)) return 30;
  if (name.split(/\s+/).some(part => part.startsWith(query))) return 35;

  const searchText = buildSearchText(entry, extension);
  return searchText.includes(query) ? 40 : Number.POSITIVE_INFINITY;
}

export function rankLiveTransferTargets(
  entries: Array<DirectoryEntry | Record<string, any>>,
  rawQuery: unknown,
  rawExcludeExtension: unknown,
  rawLimit = 50,
  source = 'directory'
): LiveTransferSearchTarget[] {
  const query = normalizeText(rawQuery);
  const queryDigits = digits(rawQuery);
  const excludeExtension = digits(rawExcludeExtension);
  const limit = Math.max(1, Math.min(50, Number(rawLimit) || 50));
  const seen = new Set<string>();

  return (entries || [])
    .filter(entry => entry?.type === 'internal')
    .filter(entry => entry?.isSpam !== true && entry?.isBlacklisted !== true)
    .filter(entry => !truthyFlag((entry as any)?.disabled) && !truthyFlag((entry as any)?.hidden))
    .map(entry => {
      const extension = getInternalExtension(entry);
      const rank = extension && extension !== excludeExtension
        ? rankTarget(entry, query, queryDigits, extension)
        : Number.POSITIVE_INFINITY;
      return { entry, extension, rank };
    })
    .filter(item => {
      if (!Number.isFinite(item.rank) || seen.has(item.extension)) return false;
      seen.add(item.extension);
      return true;
    })
    .sort((a, b) => a.rank - b.rank || a.extension.localeCompare(b.extension, 'ru', { numeric: true }) || normalizeText(a.entry.name).localeCompare(normalizeText(b.entry.name), 'ru'))
    .slice(0, limit)
    .map(({ entry, extension }) => ({
      id: cleanText(entry.id) || extension,
      extension,
      name: cleanText(entry.name || entry.company || 'Внутренний номер').slice(0, 160),
      department: cleanText(entry.department || entry.group).slice(0, 120),
      position: cleanText(entry.position).slice(0, 120),
      comment: cleanText(entry.comment).slice(0, 200),
      sipStatus: normalizePresence((entry as any).sipStatus),
      deviceStatus: normalizePresence((entry as any).deviceStatus),
      deviceType: cleanText((entry as any).deviceType || (entry as any).sipType || (entry as any).technology).slice(0, 80),
      source: cleanText((entry as any).source) || source
    }));
}
