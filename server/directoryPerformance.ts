import { performance } from 'node:perf_hooks';
import { queryPBXPulsDb } from './pbxpulsDb.js';

export type DirectoryAccessContext = {
  privileged: boolean;
  userId: string;
  internal?: boolean;
};

export type DirectoryListInput = {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  type?: unknown;
  visibility?: unknown;
  isSpam?: unknown;
  organization?: unknown;
  responsibleUserId?: unknown;
  department?: unknown;
  group?: unknown;
  ownerUserId?: unknown;
  sortBy?: unknown;
  sortDirection?: unknown;
  responsibleUserSearchIdsByToken?: Record<string, string[]>;
  phoneSecondaryOnly?: boolean;
};

type CompactContact = {
  id: string;
  name: string;
  company: string;
  number: string;
  phones: string[];
  phone2: string;
  email: string;
  comment?: string;
  position: string;
  visibility: 'shared' | 'private';
  type: string;
  isSpam: boolean;
  isBlacklisted: boolean;
  ownerUserId: string | null;
  responsibleUserId: string;
  department: string;
  group: string;
  website?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  address?: string;
  internalExtension?: string;
  linkedExternalNumber?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  loadWarnings?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

const text = (value: unknown, max = 255): string => String(value ?? '').trim().slice(0, max);
const digits = (value: unknown): string => text(value, 64).replace(/\D/g, '');
const boolParam = (value: unknown): boolean | null => {
  const normalized = text(value, 10).toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
};
const elapsed = (started: number): number => Number((performance.now() - started).toFixed(2));
const DIRECTORY_SEARCH_METADATA_KEYS = [
  'phones', 'position', 'department', 'group', 'website', 'inn', 'kpp', 'ogrn',
  'address', 'tags', 'internalExtension', 'linkedExternalNumber', 'responsibleUserId'
] as const;

export function normalizeDirectorySearchText(value: unknown): string {
  return text(value, 240)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
    .replace(/\u00A0/gu, ' ')
    .replace(/https?:\/\//giu, ' ')
    .replace(/\bwww\./giu, ' ')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}@]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeDirectorySearchTokens(value: unknown): string[] {
  const normalized = normalizeDirectorySearchText(value);
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(' ').filter(token => token.length >= 2))).slice(0, 8);
}

const escapeLike = (value: string): string => value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
const likeClause = (column: string) => `${column} LIKE ? ESCAPE '!'`;
const metadataSearchValueSql = `COALESCE(sm.metadata_value,sm.value,sm.metadata_json,'')`;
const metadataKeyPlaceholders = DIRECTORY_SEARCH_METADATA_KEYS.map(() => '?').join(',');
const typeAliases: Record<string, string[]> = {
  client: ['client'], клиент: ['client'],
  supplier: ['supplier'], постав: ['supplier'],
  government: ['government'], гос: ['government'],
  internal: ['internal'], внутр: ['internal']
};

export function normalizeDirectoryLookupPhone(value: unknown) {
  const rawDigits = digits(value);
  if (!rawDigits) return { rawDigits: '', canonical: '', national: '', suffix7: '', variants: [] as string[] };
  const national = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;
  const canonical = national.length === 10 ? `7${national}` : rawDigits;
  const variants = Array.from(new Set([
    rawDigits,
    canonical,
    national.length === 10 ? `8${national}` : '',
    national
  ].filter(Boolean)));
  return { rawDigits, canonical, national, suffix7: national.slice(-7), variants };
}

export type DirectoryPhoneSearchPlan = {
  digits: string;
  mode: 'exact' | 'prefix' | 'prefix_suffix';
  sql: string;
  params: string[];
};

export function buildDirectoryPhoneSearchPlan(value: unknown): DirectoryPhoneSearchPlan | null {
  const search = text(value, 160).normalize('NFKC');
  if (!search || !/^[\d\s()+./-]+$/u.test(search)) return null;
  const searchDigits = digits(search);
  if (searchDigits.length < 3) return null;

  if (searchDigits.length >= 10) {
    const phone = normalizeDirectoryLookupPhone(searchDigits);
    return {
      digits: searchDigits,
      mode: 'exact',
      sql: `c.phone_normalized IN (${phone.variants.map(() => '?').join(',')})`,
      params: phone.variants
    };
  }

  const prefixes = new Set([searchDigits]);
  if (searchDigits.startsWith('9')) {
    prefixes.add(`7${searchDigits}`);
    prefixes.add(`8${searchDigits}`);
  }
  const clauses = Array.from(prefixes).map(() => 'c.phone_normalized LIKE ?');
  const params = Array.from(prefixes).map(prefix => `${prefix}%`);
  if (searchDigits.length >= 5) {
    clauses.push('c.phone_normalized LIKE ?');
    params.push(`%${searchDigits}`);
  }
  return {
    digits: searchDigits,
    mode: searchDigits.length >= 5 ? 'prefix_suffix' : 'prefix',
    sql: `(${clauses.join(' OR ')})`,
    params
  };
}

const accessClause = (access: DirectoryAccessContext, params: any[]): string => {
  if (access.privileged || access.internal) return '1=1';
  params.push(access.userId);
  return `(COALESCE(c.visibility, IF(c.contact_type='personal','private','shared')) <> 'private' OR c.owner_user_id = ?)`;
};

const parseMetadata = (rows: any[]): Map<string, Record<string, any>> => {
  const result = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const id = String(row.contact_id || '');
    if (!id) continue;
    const current = result.get(id) || {};
    const key = String(row.metadata_key || '');
    let value: any = row.metadata_value ?? row.value ?? row.metadata_json ?? '';
    if (row.metadata_json) {
      try { value = JSON.parse(row.metadata_json); } catch (_error) {}
    }
    current[key] = value;
    result.set(id, current);
  }
  return result;
};

const rowToContact = (row: any, metadata: Record<string, any> = {}, includeDetails = false): CompactContact => {
  const extraPhones = Array.isArray(metadata.phones) ? metadata.phones : [];
  const phones = Array.from(new Set([row.phone, row.phone2, ...extraPhones].map(value => text(value, 100)).filter(Boolean)));
  const contact: CompactContact = {
    id: text(row.id, 64),
    name: text(row.name),
    company: text(row.company),
    number: text(row.phone, 100),
    phones,
    phone2: text(row.phone2, 100),
    email: text(row.email),
    position: text(metadata.position),
    visibility: row.contact_type === 'personal' || row.visibility === 'private' ? 'private' : 'shared',
    type: text(row.type, 32) || 'client',
    isSpam: Boolean(row.is_spam),
    isBlacklisted: Boolean(row.is_blacklisted),
    ownerUserId: row.owner_user_id ? text(row.owner_user_id, 64) : null,
    responsibleUserId: text(metadata.responsibleUserId, 100),
    department: text(metadata.department),
    group: text(metadata.group),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
  if (!includeDetails) return contact;
  return {
    ...contact,
    comment: text(row.comment, 10_000),
    website: text(metadata.website),
    inn: text(metadata.inn, 64),
    kpp: text(metadata.kpp, 64),
    ogrn: text(metadata.ogrn, 64),
    address: text(metadata.address, 1000),
    internalExtension: text(metadata.internalExtension, 64),
    linkedExternalNumber: text(metadata.linkedExternalNumber, 100),
    tags: Array.isArray(metadata.tags) ? metadata.tags.map(value => text(value, 100)).filter(Boolean) : [],
    customFields: metadata.customFields && typeof metadata.customFields === 'object' ? metadata.customFields : {}
  };
};

let countGeneration = 1;
const countCache = new Map<string, { expiresAt: number; count: number; generation: number }>();
let lookupGeneration = 1;
const lookupCache = new Map<string, { expiresAt: number; value: CompactContact | null; generation: number }>();
const LOOKUP_CACHE_MAX = 5000;

export function invalidateDirectoryPerformanceCaches(_reason = 'directory_write'): void {
  countGeneration++;
  lookupGeneration++;
  countCache.clear();
  lookupCache.clear();
}

export function getDirectoryPerformanceCacheStats() {
  return { lookupEntries: lookupCache.size, lookupGeneration, countEntries: countCache.size, countGeneration };
}

const buildFilters = (input: DirectoryListInput, access: DirectoryAccessContext) => {
  const params: any[] = [];
  const where = [accessClause(access, params)];
  const type = text(input.type, 32).toLowerCase();
  const visibility = text(input.visibility, 32).toLowerCase();
  const organization = text(input.organization);
  const responsible = text(input.responsibleUserId, 100);
  const department = text(input.department);
  const group = text(input.group);
  const ownerUserId = text(input.ownerUserId, 64);
  const isSpam = boolParam(input.isSpam);
  if (['internal', 'client', 'supplier', 'government'].includes(type)) {
    where.push('c.type = ?'); params.push(type);
  }
  if (visibility === 'shared' || visibility === 'private') {
    where.push(`COALESCE(c.visibility, IF(c.contact_type='personal','private','shared')) = ?`); params.push(visibility);
  }
  if (isSpam !== null) { where.push('c.is_spam = ?'); params.push(isSpam ? 1 : 0); }
  if (organization) { where.push('c.company = ?'); params.push(organization); }
  if (responsible) {
    where.push(`EXISTS (SELECT 1 FROM directory_contact_metadata rm WHERE rm.contact_id=c.id AND rm.metadata_key='responsibleUserId' AND COALESCE(rm.metadata_value,rm.value,'')=?)`);
    params.push(responsible);
  }
  if (department) {
    where.push(`EXISTS (SELECT 1 FROM directory_contact_metadata dm WHERE dm.contact_id=c.id AND dm.metadata_key='department' AND COALESCE(dm.metadata_value,dm.value,'')=?)`);
    params.push(department);
  }
  if (group) {
    where.push(`EXISTS (SELECT 1 FROM directory_contact_metadata gm WHERE gm.contact_id=c.id AND gm.metadata_key='group' AND COALESCE(gm.metadata_value,gm.value,'')=?)`);
    params.push(group);
  }
  if (ownerUserId) {
    where.push('c.owner_user_id = ?');
    params.push(ownerUserId);
  }
  const search = text(input.search, 240).normalize('NFKC');
  const tokens = normalizeDirectorySearchTokens(search);
  const searchTooShort = Boolean(search && !tokens.length && !buildDirectoryPhoneSearchPlan(search));
  if (search) {
    const phoneSearch = buildDirectoryPhoneSearchPlan(search);
    if (phoneSearch) {
      if (input.phoneSecondaryOnly) {
        const phonePattern = `%${escapeLike(phoneSearch.digits)}%`;
        where.push(`(
          ${likeClause('c.phone2')}
          OR EXISTS (
            SELECT 1 FROM directory_contact_metadata spm
            WHERE spm.contact_id=c.id
              AND spm.metadata_key IN ('phones','linkedExternalNumber','internalExtension')
              AND COALESCE(spm.metadata_value,spm.value,spm.metadata_json,'') LIKE ? ESCAPE '!'
          )
        )`);
        params.push(phonePattern, phonePattern);
      } else {
        where.push(phoneSearch.sql);
        params.push(...phoneSearch.params);
      }
    } else if (tokens.length) {
      for (const token of tokens) {
        const pattern = `%${escapeLike(token)}%`;
        const tokenClauses = [
          likeClause('c.name'), likeClause('c.company'), likeClause('c.email'),
          likeClause('c.comment'), likeClause('c.phone2')
        ];
        const tokenParams: any[] = [pattern, pattern, pattern, pattern, pattern];
        const digitsToken = token.replace(/\D/g, '');
        if (digitsToken.length >= 3) {
          const phonePlan = buildDirectoryPhoneSearchPlan(digitsToken);
          if (phonePlan) {
            tokenClauses.push(phonePlan.sql);
            tokenParams.push(...phonePlan.params);
          }
        }
        const aliasTypes = Object.entries(typeAliases)
          .filter(([alias]) => alias.startsWith(token) || token.startsWith(alias))
          .flatMap(([, values]) => values);
        if (aliasTypes.length) {
          tokenClauses.push(`c.type IN (${aliasTypes.map(() => '?').join(',')})`);
          tokenParams.push(...aliasTypes);
        }
        tokenClauses.push(
          `EXISTS (
             SELECT 1 FROM directory_contact_metadata sm
             WHERE sm.contact_id=c.id
               AND sm.metadata_key IN (${metadataKeyPlaceholders})
               AND ${metadataSearchValueSql} LIKE ? ESCAPE '!'
           )`
        );
        tokenParams.push(...DIRECTORY_SEARCH_METADATA_KEYS, pattern);
        const responsibleIds = input.responsibleUserSearchIdsByToken?.[token] || [];
        if (responsibleIds.length) {
          tokenClauses.push(
            `EXISTS (
               SELECT 1 FROM directory_contact_metadata rum
               WHERE rum.contact_id=c.id
                 AND rum.metadata_key='responsibleUserId'
                 AND COALESCE(rum.metadata_value,rum.value,'') IN (${responsibleIds.map(() => '?').join(',')})
             )`
          );
          tokenParams.push(...responsibleIds);
        }
        where.push(`(${tokenClauses.join(' OR ')})`);
        params.push(...tokenParams);
      }
    } else if (searchTooShort) where.push('0=1');
  }
  return { whereSql: where.join(' AND '), params, search, tokens, searchTooShort };
};

const sortSql = (input: DirectoryListInput, search: string): { sql: string; params: any[] } => {
  const field = text(input.sortBy, 32);
  const direction = text(input.sortDirection, 8).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (search) {
    const normalized = normalizeDirectorySearchText(search);
    const phone = buildDirectoryPhoneSearchPlan(search);
    if (phone?.mode === 'exact') {
      return {
        sql: `CASE WHEN ${phone.sql} THEN 0 ELSE 8 END,c.name ASC,c.id ASC`,
        params: phone.params
      };
    }
    if (phone) {
      return { sql: 'c.phone_normalized ASC,c.id ASC', params: [] };
    }
    const exact = normalized;
    const prefix = `${escapeLike(normalized)}%`;
    return {
      sql: `CASE
        WHEN c.email = ? THEN 1
        WHEN c.name = ? THEN 2
        WHEN ${likeClause('c.name')} THEN 3
        WHEN c.company = ? THEN 4
        WHEN ${likeClause('c.company')} THEN 5
        ELSE 8 END,c.name ASC,c.id ASC`,
      params: [exact, exact, prefix, exact, prefix]
    };
  }
  const fields: Record<string, string> = {
    name: 'c.name', normalized_name: 'c.name', organization: 'c.company',
    createdAt: 'c.created_at', created_at: 'c.created_at', phone: 'c.phone_normalized', phone_normalized: 'c.phone_normalized'
  };
  return { sql: `${fields[field] || 'c.name'} ${direction},c.id ${direction}`, params: [] };
};

export async function listDirectoryContactsSql(input: DirectoryListInput, access: DirectoryAccessContext) {
  const totalStarted = performance.now();
  const pageSize = Math.max(1, Math.min(500, Number(input.pageSize) || 50));
  const page = Math.max(1, Math.min(1_000_000, Number(input.page) || 1));
  const offset = (page - 1) * pageSize;
  const filters = buildFilters(input, access);
  const order = sortSql(input, filters.search);
  const cacheKey = JSON.stringify([countGeneration, access.privileged, access.userId, filters.whereSql, filters.params]);
  let totalCount = 0;
  let directoryCountMs = 0;
  const cached = countCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && cached.generation === countGeneration) {
    totalCount = cached.count;
  } else {
    const countStarted = performance.now();
    const countRows = await queryPBXPulsDb(`SELECT COUNT(*) count FROM directory_contacts c WHERE ${filters.whereSql}`, filters.params);
    directoryCountMs = elapsed(countStarted);
    totalCount = Number(countRows[0]?.count || 0);
    if (countCache.size >= 500) countCache.delete(countCache.keys().next().value as string);
    countCache.set(cacheKey, { count: totalCount, expiresAt: Date.now() + 30_000, generation: countGeneration });
  }
  const queryStarted = performance.now();
  const rows = await queryPBXPulsDb(
    `SELECT c.id,c.name,c.company,c.phone,c.phone_normalized,c.phone2,c.email,c.comment,c.contact_type,c.owner_user_id,
            c.visibility,c.type,c.is_spam,c.is_blacklisted,c.created_at,c.updated_at
     FROM directory_contacts c
     WHERE ${filters.whereSql}
     ORDER BY ${order.sql}
     LIMIT ${pageSize} OFFSET ${offset}`,
    [...filters.params, ...order.params]
  );
  const directoryQueryMs = elapsed(queryStarted);
  const metadataStarted = performance.now();
  const ids = rows.map(row => String(row.id || '')).filter(Boolean);
  const metadataRows = ids.length ? await queryPBXPulsDb(
    `SELECT contact_id,metadata_key,metadata_value,metadata_json,value
     FROM directory_contact_metadata
     WHERE contact_id IN (${ids.map(() => '?').join(',')})
       AND metadata_key IN (${DIRECTORY_SEARCH_METADATA_KEYS.map(() => '?').join(',')})
     ORDER BY contact_id,metadata_key`,
    [...ids, ...DIRECTORY_SEARCH_METADATA_KEYS]
  ) : [];
  const metadataJoinMs = elapsed(metadataStarted);
  const metadata = parseMetadata(metadataRows);
  const items = rows.map(row => {
    const itemMetadata = metadata.get(String(row.id)) || {};
    const item: any = rowToContact(row, itemMetadata);
    if (filters.tokens.length) {
      const fields: Record<string, unknown> = {
        name: row.name, organization: row.company, phone: row.phone, phone2: row.phone2,
        email: row.email, comment: row.comment, position: itemMetadata.position,
        department: itemMetadata.department, group: itemMetadata.group, website: itemMetadata.website,
        inn: itemMetadata.inn, kpp: itemMetadata.kpp, ogrn: itemMetadata.ogrn,
        address: itemMetadata.address, tags: itemMetadata.tags,
        internalExtension: itemMetadata.internalExtension,
        linkedExternalNumber: itemMetadata.linkedExternalNumber,
        responsibleUserId: itemMetadata.responsibleUserId
      };
      item.matchedFields = Object.entries(fields)
        .filter(([, value]) => {
          const haystack = normalizeDirectorySearchText(Array.isArray(value) ? value.join(' ') : value);
          return filters.tokens.some(token => haystack.includes(token));
        })
        .map(([key]) => key)
        .slice(0, 6);
    }
    return item;
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const nextPage = page < totalPages ? page + 1 : null;
  const previousPage = page > 1 ? page - 1 : null;
  const response = {
    items,
    page,
    pageSize,
    total: totalCount,
    totalCount,
    totalPages,
    searchTooShort: filters.searchTooShort,
    nextCursor: nextPage ? Buffer.from(String(nextPage)).toString('base64url') : null,
    previousCursor: previousPage ? Buffer.from(String(previousPage)).toString('base64url') : null,
    hasNext: nextPage !== null,
    hasPrevious: previousPage !== null,
    metrics: {
      directory_count_ms: directoryCountMs,
      directory_query_ms: directoryQueryMs,
      metadata_join_ms: metadataJoinMs,
      sql_query_count: ids.length ? (directoryCountMs ? 3 : 2) : (directoryCountMs ? 2 : 1),
      contacts_loaded: items.length,
      total_ms: elapsed(totalStarted)
    }
  };
  if (
    response.totalCount === 0
    && !input.phoneSecondaryOnly
    && buildDirectoryPhoneSearchPlan(input.search)
  ) {
    return listDirectoryContactsSql({ ...input, phoneSecondaryOnly: true }, access);
  }
  return response;
}

const compactFields = `c.id,c.name,c.company,c.phone,c.phone_normalized,c.phone2,c.email,c.contact_type,c.owner_user_id,
  c.visibility,c.type,c.is_spam,c.is_blacklisted,c.created_at,c.updated_at`;

export async function getDirectoryContactSql(id: unknown, access: DirectoryAccessContext): Promise<CompactContact | null> {
  const params: any[] = [];
  const accessSql = accessClause(access, params);
  params.push(text(id, 64));
  const rows = await queryPBXPulsDb(`SELECT ${compactFields},c.comment FROM directory_contacts c WHERE ${accessSql} AND c.id=? LIMIT 1`, params);
  if (!rows[0]) return null;
  try {
    const metadataRows = await queryPBXPulsDb(
      `SELECT contact_id,metadata_key,metadata_value,metadata_json,value FROM directory_contact_metadata WHERE contact_id=? ORDER BY metadata_key`,
      [rows[0].id]
    );
    return rowToContact(rows[0], parseMetadata(metadataRows).get(String(rows[0].id)) || {}, true);
  } catch (_error) {
    return {
      ...rowToContact(rows[0], {}, true),
      loadWarnings: ['Основные данные загружены, но дополнительные поля временно недоступны.']
    };
  }
}

const cacheKeyForLookup = (phone: string, access: DirectoryAccessContext): string =>
  `${lookupGeneration}:${access.internal ? 'internal' : access.privileged ? 'privileged' : access.userId}:${phone}`;

export async function lookupDirectoryPhoneSql(rawPhone: unknown, access: DirectoryAccessContext) {
  const started = performance.now();
  const normalized = normalizeDirectoryLookupPhone(rawPhone);
  if (!normalized.canonical) return { matched: false, confidence: 0, matchType: 'none', contact: null, lookupMs: elapsed(started), cache: 'miss' };
  const key = cacheKeyForLookup(normalized.canonical, access);
  const cached = lookupCache.get(key);
  if (cached && cached.expiresAt > Date.now() && cached.generation === lookupGeneration) {
    lookupCache.delete(key); lookupCache.set(key, cached);
    return { matched: !!cached.value, confidence: cached.value ? 1 : 0, matchType: cached.value ? 'cache_exact' : 'none', contact: cached.value, lookupMs: elapsed(started), cache: 'hit' };
  }
  const params: any[] = [];
  const accessSql = accessClause(access, params);
  params.push(...normalized.variants);
  const rows = await queryPBXPulsDb(
    `SELECT ${compactFields} FROM directory_contacts c
     WHERE ${accessSql} AND c.phone_normalized IN (${normalized.variants.map(() => '?').join(',')})
     ORDER BY CASE WHEN c.phone_normalized=? THEN 0 ELSE 1 END,c.id LIMIT 2`,
    [...params, normalized.canonical]
  );
  const contact = rows[0] ? rowToContact(rows[0]) : null;
  if (lookupCache.size >= LOOKUP_CACHE_MAX) lookupCache.delete(lookupCache.keys().next().value as string);
  lookupCache.set(key, { value: contact, expiresAt: Date.now() + (contact ? 10 * 60_000 : 45_000), generation: lookupGeneration });
  return {
    matched: !!contact,
    confidence: contact ? (rows[0].phone_normalized === normalized.canonical ? 1 : 0.95) : 0,
    matchType: contact ? (rows[0].phone_normalized === normalized.canonical ? 'canonical_exact' : 'national_exact') : 'none',
    contact,
    matchedPhone: contact?.number || null,
    lookupMs: elapsed(started),
    cache: 'miss'
  };
}

export async function bulkLookupDirectoryPhonesSql(rawPhones: unknown[], access: DirectoryAccessContext, max = 1000) {
  const started = performance.now();
  const requested = Array.from(new Set(rawPhones.slice(0, max).map(value => normalizeDirectoryLookupPhone(value).canonical).filter(Boolean)));
  if (!requested.length) return { matches: {}, lookupMs: elapsed(started), requested: 0, matched: 0, sqlQueryCount: 0 };
  const allVariants = Array.from(new Set(requested.flatMap(value => normalizeDirectoryLookupPhone(value).variants)));
  const params: any[] = [];
  const accessSql = accessClause(access, params);
  params.push(...allVariants);
  const rows = await queryPBXPulsDb(
    `SELECT ${compactFields} FROM directory_contacts c WHERE ${accessSql} AND c.phone_normalized IN (${allVariants.map(() => '?').join(',')})`,
    params
  );
  const byStoredPhone = new Map(rows.map(row => [String(row.phone_normalized || ''), rowToContact(row)]));
  const matches: Record<string, CompactContact> = {};
  for (const canonical of requested) {
    const variants = normalizeDirectoryLookupPhone(canonical).variants;
    const contact = variants.map(value => byStoredPhone.get(value)).find(Boolean);
    if (contact) matches[canonical] = contact;
  }
  return { matches, lookupMs: elapsed(started), requested: requested.length, matched: Object.keys(matches).length, sqlQueryCount: 1 };
}
