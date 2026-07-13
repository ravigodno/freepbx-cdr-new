import type { AppSettings, DirectoryEntry } from '../src/types.js';
import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getPBXPulsSetting } from './pbxpulsSettings.js';
import { rankLiveTransferTargets, type LiveTransferSearchTarget } from './liveTransferSearch.js';

export type DirectoryStorageMode = 'legacy' | 'sql';
export type DirectoryEffectiveSource = 'data/db.json' | 'pbxpuls_sql';

export interface DirectoryRuntimeContext {
  legacyDirectory?: any[];
  settings?: AppSettings;
  authUser?: any;
  dbUser?: any;
}

export interface DirectoryRuntimeSnapshot {
  configuredMode: DirectoryStorageMode;
  effectiveSource: DirectoryEffectiveSource;
  sqlAvailable: boolean;
  contacts: DirectoryEntry[];
  writeMode: 'legacy';
  fallbackReason?: string;
}

export interface DirectoryExtensionSearchResult {
  items: LiveTransferSearchTarget[];
  source: DirectoryEffectiveSource;
  directoryAvailable: boolean;
  fallbackReason?: string;
}

type DirectorySqlContactRow = {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone2: string | null;
  email: string | null;
  comment: string | null;
  contact_type: 'common' | 'personal' | string | null;
  owner_user_id: string | null;
  visibility: 'shared' | 'private' | string | null;
  type: 'internal' | 'client' | 'supplier' | 'government' | string | null;
  is_spam: number | boolean | null;
  is_blacklisted: number | boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type DirectorySqlMetadataRow = {
  contact_id: string;
  metadata_key: string | null;
  metadata_value: string | null;
  metadata_json: string | null;
  value: string | null;
  field_key?: string | null;
  show_in_search?: number | boolean | null;
};

const DIRECTORY_SQL_READ_AUDIT_COOLDOWN_MS = 5 * 60 * 1000;
let lastDirectorySqlReadAuditAt = 0;

export async function getDirectoryStorageMode(): Promise<DirectoryStorageMode> {
  const mode = await getPBXPulsSetting<DirectoryStorageMode>('directory.storage_mode', 'legacy');
  return mode === 'sql' ? 'sql' : 'legacy';
}

export async function getDirectoryRuntimeSnapshot(context: DirectoryRuntimeContext = {}): Promise<DirectoryRuntimeSnapshot> {
  const configuredMode = await getDirectoryStorageMode();
  const legacyContacts = Array.isArray(context.legacyDirectory) ? context.legacyDirectory : [];

  if (configuredMode !== 'sql') {
    return {
      configuredMode,
      effectiveSource: 'data/db.json',
      sqlAvailable: false,
      contacts: legacyContacts,
      writeMode: 'legacy'
    };
  }

  try {
    const contacts = await searchDirectoryContacts(context);
    await writeDirectorySqlReadUsedEvent();
    return {
      configuredMode,
      effectiveSource: 'pbxpuls_sql',
      sqlAvailable: true,
      contacts,
      writeMode: 'legacy'
    };
  } catch (error: any) {
    console.warn('[PBXPULS_DIRECTORY_RUNTIME] SQL read fallback:', sanitizePBXPulsDbError(error));
    return {
      configuredMode,
      effectiveSource: 'data/db.json',
      sqlAvailable: false,
      contacts: legacyContacts,
      writeMode: 'legacy',
      fallbackReason: 'sql_read_failed'
    };
  }
}

export async function getDirectoryContactByPhone(phone: unknown, context: DirectoryRuntimeContext = {}): Promise<DirectoryEntry | null> {
  const normalized = normalizePhoneForLookup(phone);
  if (!normalized) return null;

  const contacts = await searchDirectoryContacts(context);
  return contacts.find(contact => contactMatchesPhone(contact, normalized)) || null;
}

export async function searchDirectoryContacts(context: DirectoryRuntimeContext = {}): Promise<DirectoryEntry[]> {
  const visibleRows = await selectVisibleDirectoryContactRows(context);
  const contactIds = visibleRows.map(row => String(row.id || '')).filter(Boolean);
  const metadataByContactId = await selectDirectoryMetadataRows(contactIds);

  return visibleRows.map(row => buildDirectoryEntryFromSql(row, metadataByContactId.get(String(row.id || '')) || []));
}

export async function searchDirectoryInternalExtensions(
  rawQuery: unknown,
  rawLimit: unknown,
  rawExcludeExtension: unknown,
  context: DirectoryRuntimeContext = {}
): Promise<DirectoryExtensionSearchResult> {
  const query = safeText(rawQuery, 120)
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е');
  const queryDigits = query.replace(/\D/g, '');
  const excludeExtension = safeText(rawExcludeExtension, 20).replace(/\D/g, '');
  const limit = Math.max(1, Math.min(50, Number(rawLimit) || 50));
  const configuredMode = await getDirectoryStorageMode();

  if (configuredMode === 'sql') {
    try {
      const authUser = context.authUser || {};
      const dbUser = context.dbUser || {};
      const ownerUserId = getDirectoryRuntimeUserId(dbUser, authUser);
      const params: any[] = [authUser?.role === 'su' ? 1 : 0, ownerUserId];
      let searchSql = '';

      if (query) {
        const like = `%${query}%`;
        const digitsLike = `%${queryDigits}%`;
        searchSql = `
          AND (
            REPLACE(LOWER(CONCAT_WS(' ', c.name, c.company, c.phone, c.phone2, c.comment)), 'ё', 'е') LIKE ?
            ${queryDigits ? 'OR c.phone_normalized LIKE ?' : ''}
            OR EXISTS (
              SELECT 1
              FROM directory_contact_metadata sm
              LEFT JOIN directory_custom_fields sf ON sf.id = sm.field_id
              WHERE sm.contact_id = c.id
                AND (
                  sm.metadata_key IN ('phones','position','department','group','internalExtension','tags','sipStatus','deviceStatus','deviceType','source')
                  OR sf.show_in_search = 1
                )
                AND COALESCE(sm.metadata_key, sf.field_key, '') NOT REGEXP 'password|passwd|token|secret|credential|private[_-]?key|api[_-]?key'
                AND REPLACE(LOWER(COALESCE(sm.metadata_value, sm.value, sm.metadata_json, '')), 'ё', 'е') LIKE ?
            )
          )`;
        params.push(like);
        if (queryDigits) params.push(digitsLike);
        params.push(like);
      }

      const candidateLimit = Math.min(200, Math.max(limit * 4, 50));
      const rows = await queryPBXPulsDb(
        `SELECT c.id, c.name, c.company, c.phone, c.phone_normalized, c.phone2, c.email, c.comment,
                c.contact_type, c.owner_user_id, c.visibility, c.type, c.is_spam, c.is_blacklisted,
                c.created_at, c.updated_at
         FROM directory_contacts c
         WHERE c.type = 'internal'
           AND COALESCE(c.is_spam, 0) = 0
           AND COALESCE(c.is_blacklisted, 0) = 0
           AND (COALESCE(c.contact_type, 'common') <> 'personal' OR ? = 1 OR c.owner_user_id = ?)
           AND NOT EXISTS (
             SELECT 1 FROM directory_contact_metadata hm
             WHERE hm.contact_id = c.id
               AND hm.metadata_key IN ('hidden','disabled','isDisabled')
               AND LOWER(COALESCE(hm.metadata_value, hm.value, '')) IN ('1','true','yes','да','y')
           )
           ${searchSql}
         ORDER BY
           CASE
             WHEN ? <> '' AND c.phone_normalized = ? THEN 0
             WHEN ? <> '' AND c.phone_normalized LIKE CONCAT(?, '%') THEN 1
             WHEN ? <> '' AND REPLACE(LOWER(c.name), 'ё', 'е') LIKE CONCAT(?, '%') THEN 2
             ELSE 3
           END,
           c.phone_normalized ASC, c.name ASC, c.id ASC
         LIMIT ${candidateLimit}`,
        [...params, queryDigits, queryDigits, queryDigits, queryDigits, query, query]
      ) as DirectorySqlContactRow[];

      const contactIds = rows.map(row => String(row.id || '')).filter(Boolean);
      const metadataByContactId = await selectDirectorySearchMetadataRows(contactIds);
      const contacts = rows.map(row => {
        const metadataRows = metadataByContactId.get(String(row.id || '')) || [];
        const entry = buildDirectoryEntryFromSql(row, metadataRows) as DirectoryEntry & Record<string, any>;
        entry.searchMetadata = metadataRows
          .filter(metadata => {
            const key = String(metadata.metadata_key || metadata.field_key || '');
            const isSearchable = metadata.show_in_search === true || Number(metadata.show_in_search || 0) === 1 || [
              'phones',
              'position',
              'department',
              'group',
              'internalExtension',
              'tags',
              'sipStatus',
              'deviceStatus',
              'deviceType',
              'source'
            ].includes(key);
            return isSearchable && !/(password|passwd|token|secret|credential|private[_-]?key|api[_-]?key)/i.test(key);
          })
          .map(parseDirectoryMetadataValue)
          .flatMap(value => Array.isArray(value) ? value : [value])
          .map(value => safeText(value, 500))
          .filter(Boolean);
        entry.source = 'pbxpuls_sql';
        return entry;
      });

      return {
        items: rankLiveTransferTargets(contacts, query, excludeExtension, limit, 'pbxpuls_sql'),
        source: 'pbxpuls_sql',
        directoryAvailable: true
      };
    } catch (error: any) {
      const fallback = rankLiveTransferTargets(context.legacyDirectory || [], query, excludeExtension, limit, 'data/db.json');
      return {
        items: fallback,
        source: 'data/db.json',
        directoryAvailable: Array.isArray(context.legacyDirectory) && context.legacyDirectory.length > 0,
        fallbackReason: sanitizePBXPulsDbError(error)
      };
    }
  }

  return {
    items: rankLiveTransferTargets(context.legacyDirectory || [], query, excludeExtension, limit, 'data/db.json'),
    source: 'data/db.json',
    directoryAvailable: true
  };
}

async function selectVisibleDirectoryContactRows(context: DirectoryRuntimeContext): Promise<DirectorySqlContactRow[]> {
  const authUser = context.authUser || {};
  const dbUser = context.dbUser || {};
  const isSuperUser = authUser?.role === 'su';
  const ownerUserId = getDirectoryRuntimeUserId(dbUser, authUser);

  const rows = await queryPBXPulsDb(
    `SELECT id, name, company, phone, phone_normalized, phone2, email, comment,
            contact_type, owner_user_id, visibility, type, is_spam, is_blacklisted,
            created_at, updated_at
     FROM directory_contacts
     WHERE contact_type <> 'personal'
        OR ? = 1
        OR owner_user_id = ?
     ORDER BY name ASC, company ASC, id ASC
     LIMIT 10000`,
    [isSuperUser ? 1 : 0, ownerUserId]
  );

  return rows as DirectorySqlContactRow[];
}

async function selectDirectoryMetadataRows(contactIds: string[]): Promise<Map<string, DirectorySqlMetadataRow[]>> {
  const result = new Map<string, DirectorySqlMetadataRow[]>();
  if (!contactIds.length) return result;

  const placeholders = contactIds.map(() => '?').join(', ');
  const rows = await queryPBXPulsDb(
    `SELECT contact_id, metadata_key, metadata_value, metadata_json, value
     FROM directory_contact_metadata
     WHERE contact_id IN (${placeholders})
     ORDER BY contact_id, metadata_key`,
    contactIds
  ) as DirectorySqlMetadataRow[];

  for (const row of rows) {
    const contactId = String(row.contact_id || '');
    if (!contactId) continue;
    if (!result.has(contactId)) result.set(contactId, []);
    result.get(contactId)!.push(row);
  }

  return result;
}

async function selectDirectorySearchMetadataRows(contactIds: string[]): Promise<Map<string, DirectorySqlMetadataRow[]>> {
  const result = new Map<string, DirectorySqlMetadataRow[]>();
  if (!contactIds.length) return result;

  const placeholders = contactIds.map(() => '?').join(', ');
  const rows = await queryPBXPulsDb(
    `SELECT m.contact_id, m.metadata_key, m.metadata_value, m.metadata_json, m.value,
            f.field_key, f.show_in_search
     FROM directory_contact_metadata m
     LEFT JOIN directory_custom_fields f ON f.id = m.field_id
     WHERE m.contact_id IN (${placeholders})
     ORDER BY m.contact_id, m.metadata_key`,
    contactIds
  ) as DirectorySqlMetadataRow[];

  for (const row of rows) {
    const contactId = String(row.contact_id || '');
    if (!contactId) continue;
    if (!result.has(contactId)) result.set(contactId, []);
    result.get(contactId)!.push(row);
  }

  return result;
}

function buildDirectoryEntryFromSql(row: DirectorySqlContactRow, metadataRows: DirectorySqlMetadataRow[]): DirectoryEntry {
  const visibility = row.contact_type === 'personal' || row.visibility === 'private' ? 'private' : 'shared';
  const phones = uniqueStrings([row.phone, row.phone2]);
  const entry: DirectoryEntry = {
    id: safeText(row.id, 64),
    name: safeText(row.name, 255),
    number: safeText(row.phone, 64),
    phones,
    type: normalizeDirectoryType(row.type),
    visibility,
    ownerUserId: visibility === 'private' ? safeNullableText(row.owner_user_id, 64) : null,
    company: safeText(row.company, 255),
    email: safeText(row.email, 255),
    comment: safeText(row.comment, 65535),
    isSpam: row.is_spam === true || Number(row.is_spam || 0) === 1,
    isBlacklisted: row.is_blacklisted === true || Number(row.is_blacklisted || 0) === 1,
    createdAt: normalizeIsoDate(row.created_at),
    updatedAt: normalizeIsoDate(row.updated_at)
  };

  for (const metadata of metadataRows) {
    applyDirectoryMetadata(entry, metadata);
  }

  entry.phones = uniqueStrings([...(entry.phones || []), entry.number]);
  entry.number = entry.phones[0] || entry.number || '';
  return entry;
}

function applyDirectoryMetadata(entry: DirectoryEntry, metadata: DirectorySqlMetadataRow): void {
  const key = safeText(metadata.metadata_key, 100);
  if (!key) return;
  const value = parseDirectoryMetadataValue(metadata);

  if (key === 'phones') {
    const phones = Array.isArray(value) ? value : [value];
    entry.phones = uniqueStrings([...(entry.phones || []), ...phones]);
    return;
  }

  if (key === 'tags') {
    const tags = Array.isArray(value) ? value : String(value || '').split(/[;,|]+/);
    entry.tags = uniqueStrings(tags);
    return;
  }

  if (isKnownDirectoryMetadataKey(key)) {
    (entry as any)[key] = Array.isArray(value) || (value && typeof value === 'object')
      ? JSON.stringify(value)
      : safeText(value, 65535);
  }
}

function parseDirectoryMetadataValue(metadata: DirectorySqlMetadataRow): unknown {
  const jsonValue = String(metadata.metadata_json || '').trim();
  if (jsonValue) {
    try {
      return JSON.parse(jsonValue);
    } catch (_error) {
      return '';
    }
  }

  return metadata.metadata_value ?? metadata.value ?? '';
}

function contactMatchesPhone(contact: DirectoryEntry, normalizedPhone: string): boolean {
  return [contact.number, ...(contact.phones || [])].some(phone => {
    const candidate = normalizePhoneForLookup(phone);
    return candidate &&
      (
        candidate === normalizedPhone ||
        (candidate.length > 4 && normalizedPhone.length > 4 && (candidate.endsWith(normalizedPhone) || normalizedPhone.endsWith(candidate)))
      );
  });
}

function normalizePhoneForLookup(value: unknown): string {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits;
}

function getDirectoryRuntimeUserId(dbUser: any, authUser: any): string {
  return String(dbUser?.id || authUser?.username || '').trim();
}

function normalizeDirectoryType(value: unknown): DirectoryEntry['type'] {
  const type = String(value || '').trim().toLowerCase();
  return type === 'internal' || type === 'supplier' || type === 'government' ? type : 'client';
}

function normalizeIsoDate(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const parsed = new Date(text.replace(' ', 'T'));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text;
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeNullableText(value: unknown, maxLength: number): string | null {
  const text = safeText(value, maxLength);
  return text || null;
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function isKnownDirectoryMetadataKey(key: string): boolean {
  return [
    'position',
    'department',
    'group',
    'website',
    'inn',
    'kpp',
    'ogrn',
    'address',
    'internalExtension',
    'linkedExternalNumber',
    'responsibleUserId',
    'sipStatus',
    'deviceStatus',
    'deviceType',
    'sipType',
    'technology',
    'source',
    'disabled',
    'hidden'
  ].includes(key);
}

async function writeDirectorySqlReadUsedEvent(): Promise<void> {
  const now = Date.now();
  if (now - lastDirectorySqlReadAuditAt < DIRECTORY_SQL_READ_AUDIT_COOLDOWN_MS) return;

  lastDirectorySqlReadAuditAt = now;
  const written = await writePBXPulsSystemEvent({
    event_type: 'directory_sql_read_used',
    severity: 'info',
    source: 'pbxpuls_directory_runtime',
    message: 'Directory SQL read runtime used',
    details: {
      source: 'pbxpuls_sql'
    }
  });

  if (!written) {
    lastDirectorySqlReadAuditAt = 0;
  }
}
