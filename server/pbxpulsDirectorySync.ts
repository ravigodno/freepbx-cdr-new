import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { getPBXPulsSetting } from './pbxpulsSettings.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';

type DirectorySqlSyncReason =
  | 'stale_primary_phone'
  | 'stale_contact_fields'
  | 'missing_sql_contact'
  | 'safe_metadata_diff';

type DirectorySqlSyncContactDiff = {
  id: string;
  reasons: DirectorySqlSyncReason[];
};

type DirectorySqlSyncContactRow = {
  id: string;
  name: string;
  company: string;
  phone: string;
  phone_normalized: string;
  phone2: string;
  email: string;
  comment: string | null;
  contact_type: 'common' | 'personal';
  owner_user_id: string | null;
  visibility: 'shared' | 'private' | null;
  type: 'internal' | 'client' | 'supplier' | 'government';
  is_spam: number;
  is_blacklisted: number;
  created_at: string | null;
  updated_at: string | null;
};

type DirectorySqlSyncMetadataRow = {
  contact_id: string;
  field_id: null;
  value: null;
  metadata_key: string;
  metadata_value: string | null;
  metadata_json: string | null;
};

type DirectorySqlSyncRows = {
  contacts: DirectorySqlSyncContactRow[];
  metadata: DirectorySqlSyncMetadataRow[];
  skippedCount: number;
};

export type DirectorySqlSyncPreview = {
  ok: boolean;
  source: 'data/db.json';
  sqlAvailable: boolean;
  applyEnabled: boolean;
  valuesReturned: false;
  legacyContactsCount: number;
  sqlContactsCount: number;
  staleContactsCount: number;
  phonesMismatchCount: number;
  metadataSyncCandidatesCount: number;
  wouldUpdateContactsCount: number;
  wouldInsertContactsCount: number;
  wouldDeleteContactsCount: 0;
  skippedInvalidLegacyContacts: number;
  contacts: DirectorySqlSyncContactDiff[];
  reasonCounts: Record<DirectorySqlSyncReason, number>;
  error?: string;
};

export type DirectorySqlSyncStatus = DirectorySqlSyncPreview & {
  syncAvailable: boolean;
  applyReason: 'directory_sql_sync_apply_enabled' | 'directory_sql_sync_apply_disabled';
};

export type DirectorySqlSyncApplyResult = {
  ok: boolean;
  applied: boolean;
  reason?: string;
  applyEnabled: boolean;
  preview: DirectorySqlSyncPreview;
  updatedContactsCount: number;
  insertedContactsCount: number;
  deletedContactsCount: 0;
  syncedMetadataCount: number;
};

const DIRECTORY_SQL_SYNC_APPLY_ENABLED_KEY = 'directory.sql_sync_apply_enabled';
const DIRECTORY_ALLOWED_TYPES = new Set(['internal', 'client', 'supplier', 'government']);
const DIRECTORY_SAFE_METADATA_FIELDS = [
  'phones',
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
  'tags'
];

const safeText = (value: unknown, maxLength: number): string => String(value ?? '').trim().slice(0, maxLength);

const nullableText = (value: unknown, maxLength: number): string | null => {
  const text = safeText(value, maxLength);
  return text ? text : null;
};

const truthyFlag = (value: unknown): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(raw);
};

const normalizeSqlDate = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizePhoneForSql = (value: unknown): string => {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits.slice(0, 32);
};

const getDirectoryPhones = (entry: any): string[] => {
  const values = [
    ...(Array.isArray(entry?.phones) ? entry.phones : []),
    entry?.number,
    entry?.phone,
    entry?.phone1,
    entry?.phone2,
    entry?.phone3
  ];
  const out: string[] = [];

  values.forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    raw.split(/[;,|\n]+/).forEach((part) => {
      const phone = String(part || '').trim();
      if (phone && !out.includes(phone)) out.push(phone);
    });
  });

  return out;
};

const normalizeContactType = (entry: any): 'common' | 'personal' => {
  const raw = String(entry?.visibility || '').trim().toLowerCase();
  return raw === 'private' || raw === 'personal' || raw === 'личный' ? 'personal' : 'common';
};

const normalizeVisibility = (entry: any): 'shared' | 'private' | null => {
  const raw = String(entry?.visibility || '').trim().toLowerCase();
  if (raw === 'private' || raw === 'personal' || raw === 'личный') return 'private';
  if (raw === 'shared' || raw === 'common' || raw === 'public') return 'shared';
  return raw ? null : 'shared';
};

const normalizeBoolean = (value: unknown): boolean => {
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || raw === 'true' || raw === '1' || raw === 'yes';
};

function buildLegacyDirectorySyncRows(legacyDb: any): DirectorySqlSyncRows {
  const directory = Array.isArray(legacyDb?.directory) ? legacyDb.directory : [];
  const contacts: DirectorySqlSyncContactRow[] = [];
  const metadata: DirectorySqlSyncMetadataRow[] = [];
  let skippedCount = 0;

  for (const entry of directory) {
    const id = safeText(entry?.id, 64);
    if (!id) {
      skippedCount += 1;
      continue;
    }

    const contact_type = normalizeContactType(entry);
    const owner_user_id = nullableText(entry?.ownerUserId || entry?.ownerId || entry?.userId, 64);
    if (contact_type === 'personal' && !owner_user_id) {
      skippedCount += 1;
      continue;
    }

    const phones = getDirectoryPhones(entry);
    const primaryPhone = safeText(phones[0] || entry?.number || entry?.phone, 64);
    const rawType = safeText(entry?.type, 32).toLowerCase();
    const directoryType = DIRECTORY_ALLOWED_TYPES.has(rawType) ? rawType as DirectorySqlSyncContactRow['type'] : 'client';
    const tags = Array.isArray(entry?.tags) ? entry.tags : [];
    const spamFromTags = tags.some((tag: any) => {
      const normalized = String(tag || '').trim().toLowerCase();
      return normalized === 'spam' || normalized === 'спам';
    });

    contacts.push({
      id,
      name: safeText(entry?.name || entry?.fio || entry?.fullname || entry?.contact, 255),
      company: safeText(entry?.company || entry?.organization || entry?.org, 255),
      phone: primaryPhone,
      phone_normalized: normalizePhoneForSql(primaryPhone),
      phone2: safeText(phones[1] || entry?.phone2, 255),
      email: safeText(entry?.email, 255),
      comment: nullableText(entry?.comment || entry?.notes, 65535),
      contact_type,
      owner_user_id: contact_type === 'personal' ? owner_user_id : null,
      visibility: normalizeVisibility(entry),
      type: directoryType,
      is_spam: truthyFlag(entry?.isSpam ?? entry?.is_spam) || spamFromTags ? 1 : 0,
      is_blacklisted: truthyFlag(entry?.isBlacklisted ?? entry?.is_blacklisted) ? 1 : 0,
      created_at: normalizeSqlDate(entry?.createdAt),
      updated_at: normalizeSqlDate(entry?.updatedAt)
    });

    for (const metadataKey of DIRECTORY_SAFE_METADATA_FIELDS) {
      const value = (entry || {})[metadataKey];
      if (value === undefined || value === null || value === '') continue;
      const isStructured = Array.isArray(value) || (typeof value === 'object' && value !== null);
      metadata.push({
        contact_id: id,
        field_id: null,
        value: null,
        metadata_key: metadataKey,
        metadata_value: isStructured ? null : safeText(value, 65535),
        metadata_json: isStructured ? JSON.stringify(value) : null
      });
    }
  }

  return { contacts, metadata, skippedCount };
}

export async function isDirectorySqlSyncApplyEnabled(): Promise<boolean> {
  const value = await getPBXPulsSetting<unknown>(DIRECTORY_SQL_SYNC_APPLY_ENABLED_KEY, false);
  return normalizeBoolean(value);
}

async function selectSqlContacts(): Promise<Map<string, any>> {
  const rows = await queryPBXPulsDb(
    `SELECT id, name, company, phone, phone_normalized, phone2, email, comment,
            contact_type, owner_user_id, visibility, type, is_spam, is_blacklisted,
            created_at, updated_at
     FROM directory_contacts
     ORDER BY id`
  );
  return new Map(rows.map(row => [String(row.id || ''), row]));
}

async function selectSqlMetadata(contactIds: string[]): Promise<Map<string, any>> {
  if (!contactIds.length) return new Map();
  const placeholders = contactIds.map(() => '?').join(', ');
  const rows = await queryPBXPulsDb(
    `SELECT contact_id, metadata_key, metadata_value, metadata_json
     FROM directory_contact_metadata
     WHERE contact_id IN (${placeholders})`,
    contactIds
  );
  return new Map(rows.map(row => [`${row.contact_id}:${row.metadata_key}`, row]));
}

function sqlValue(row: any, key: keyof DirectorySqlSyncContactRow): string {
  const value = row?.[key];
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace('T', ' ');
  return String(value ?? '');
}

function legacyValue(row: DirectorySqlSyncContactRow, key: keyof DirectorySqlSyncContactRow): string {
  return String(row[key] ?? '');
}

function contactFieldsDiffer(legacy: DirectorySqlSyncContactRow, sql: any): boolean {
  const fields: Array<keyof DirectorySqlSyncContactRow> = [
    'name',
    'company',
    'phone',
    'phone_normalized',
    'phone2',
    'email',
    'comment',
    'contact_type',
    'owner_user_id',
    'visibility',
    'type',
    'is_spam',
    'is_blacklisted',
    'created_at',
    'updated_at'
  ];

  return fields.some(field => legacyValue(legacy, field) !== sqlValue(sql, field));
}

function metadataDiffers(expected: DirectorySqlSyncMetadataRow, sql: any): boolean {
  if (!sql) return true;
  return String(sql.metadata_value ?? '') !== String(expected.metadata_value ?? '')
    || String(sql.metadata_json ?? '') !== String(expected.metadata_json ?? '');
}

function addReason(target: DirectorySqlSyncContactDiff, reason: DirectorySqlSyncReason): void {
  if (!target.reasons.includes(reason)) target.reasons.push(reason);
}

function buildPreviewFromRows(
  rows: DirectorySqlSyncRows,
  sqlContacts: Map<string, any>,
  sqlMetadata: Map<string, any>,
  applyEnabled: boolean
): DirectorySqlSyncPreview {
  const byId = new Map<string, DirectorySqlSyncContactDiff>();
  const ensure = (id: string) => {
    if (!byId.has(id)) byId.set(id, { id, reasons: [] });
    return byId.get(id)!;
  };
  let phonesMismatchCount = 0;
  let metadataSyncCandidatesCount = 0;

  for (const contact of rows.contacts) {
    const sqlContact = sqlContacts.get(contact.id);
    if (!sqlContact) {
      addReason(ensure(contact.id), 'missing_sql_contact');
      continue;
    }

    if (String(sqlContact.phone_normalized || '') !== contact.phone_normalized) {
      phonesMismatchCount += 1;
      addReason(ensure(contact.id), 'stale_primary_phone');
    }

    if (contactFieldsDiffer(contact, sqlContact)) {
      addReason(ensure(contact.id), 'stale_contact_fields');
    }
  }

  for (const metadata of rows.metadata) {
    const key = `${metadata.contact_id}:${metadata.metadata_key}`;
    if (metadataDiffers(metadata, sqlMetadata.get(key))) {
      metadataSyncCandidatesCount += 1;
      addReason(ensure(metadata.contact_id), 'safe_metadata_diff');
    }
  }

  const contacts = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
  const reasonCounts = contacts.reduce((acc, item) => {
    item.reasons.forEach(reason => {
      acc[reason] = (acc[reason] || 0) + 1;
    });
    return acc;
  }, {} as Record<DirectorySqlSyncReason, number>);
  const wouldInsertContactsCount = contacts.filter(item => item.reasons.includes('missing_sql_contact')).length;
  const wouldUpdateContactsCount = contacts.filter(item => !item.reasons.includes('missing_sql_contact')).length;

  return {
    ok: true,
    source: 'data/db.json',
    sqlAvailable: true,
    applyEnabled,
    valuesReturned: false,
    legacyContactsCount: rows.contacts.length,
    sqlContactsCount: sqlContacts.size,
    staleContactsCount: contacts.length,
    phonesMismatchCount,
    metadataSyncCandidatesCount,
    wouldUpdateContactsCount,
    wouldInsertContactsCount,
    wouldDeleteContactsCount: 0,
    skippedInvalidLegacyContacts: rows.skippedCount,
    contacts,
    reasonCounts
  };
}

export async function previewDirectorySqlSyncFromLegacy(legacyDb: any): Promise<DirectorySqlSyncPreview> {
  const rows = buildLegacyDirectorySyncRows(legacyDb);
  const applyEnabled = await isDirectorySqlSyncApplyEnabled();

  try {
    const sqlContacts = await selectSqlContacts();
    const sqlMetadata = await selectSqlMetadata(rows.contacts.map(row => row.id));
    return buildPreviewFromRows(rows, sqlContacts, sqlMetadata, applyEnabled);
  } catch (error: any) {
    return {
      ok: false,
      source: 'data/db.json',
      sqlAvailable: false,
      applyEnabled,
      valuesReturned: false,
      legacyContactsCount: rows.contacts.length,
      sqlContactsCount: 0,
      staleContactsCount: 0,
      phonesMismatchCount: 0,
      metadataSyncCandidatesCount: 0,
      wouldUpdateContactsCount: 0,
      wouldInsertContactsCount: 0,
      wouldDeleteContactsCount: 0,
      skippedInvalidLegacyContacts: rows.skippedCount,
      contacts: [],
      reasonCounts: {} as Record<DirectorySqlSyncReason, number>,
      error: sanitizePBXPulsDbError(error)
    };
  }
}

export async function getDirectorySqlSyncStatus(legacyDb: any): Promise<DirectorySqlSyncStatus> {
  const preview = await previewDirectorySqlSyncFromLegacy(legacyDb);
  return {
    ...preview,
    syncAvailable: preview.sqlAvailable === true,
    applyReason: preview.applyEnabled ? 'directory_sql_sync_apply_enabled' : 'directory_sql_sync_apply_disabled'
  };
}

async function upsertContact(row: DirectorySqlSyncContactRow): Promise<void> {
  await queryPBXPulsDb(
    `INSERT INTO directory_contacts
      (id, name, company, phone, phone_normalized, phone2, email, comment, contact_type, owner_user_id, visibility, type, is_spam, is_blacklisted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      company = VALUES(company),
      phone = VALUES(phone),
      phone_normalized = VALUES(phone_normalized),
      phone2 = VALUES(phone2),
      email = VALUES(email),
      comment = VALUES(comment),
      contact_type = VALUES(contact_type),
      owner_user_id = VALUES(owner_user_id),
      visibility = VALUES(visibility),
      type = VALUES(type),
      is_spam = VALUES(is_spam),
      is_blacklisted = VALUES(is_blacklisted),
      created_at = VALUES(created_at),
      updated_at = VALUES(updated_at)`,
    [
      row.id,
      row.name,
      row.company,
      row.phone,
      row.phone_normalized,
      row.phone2,
      row.email,
      row.comment,
      row.contact_type,
      row.owner_user_id,
      row.visibility,
      row.type,
      row.is_spam,
      row.is_blacklisted,
      row.created_at,
      row.updated_at
    ]
  );
}

async function upsertMetadata(row: DirectorySqlSyncMetadataRow): Promise<void> {
  await queryPBXPulsDb(
    `INSERT INTO directory_contact_metadata
      (contact_id, field_id, value, metadata_key, metadata_value, metadata_json, created_at, updated_at)
     VALUES (?, NULL, NULL, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
      field_id = NULL,
      value = NULL,
      metadata_value = VALUES(metadata_value),
      metadata_json = VALUES(metadata_json),
      updated_at = NOW()`,
    [row.contact_id, row.metadata_key, row.metadata_value, row.metadata_json]
  );
}

export async function applyDirectorySqlSyncFromLegacy(
  legacyDb: any,
  actor: string | { username?: string | null; role?: string | null }
): Promise<DirectorySqlSyncApplyResult> {
  const preview = await previewDirectorySqlSyncFromLegacy(legacyDb);
  if (!preview.applyEnabled) {
    return {
      ok: false,
      applied: false,
      reason: 'directory_sql_sync_apply_disabled',
      applyEnabled: false,
      preview,
      updatedContactsCount: 0,
      insertedContactsCount: 0,
      deletedContactsCount: 0,
      syncedMetadataCount: 0
    };
  }

  const rows = buildLegacyDirectorySyncRows(legacyDb);
  const staleIds = new Set(preview.contacts.map(contact => contact.id));
  const missingIds = new Set(preview.contacts.filter(contact => contact.reasons.includes('missing_sql_contact')).map(contact => contact.id));
  let updatedContactsCount = 0;
  let insertedContactsCount = 0;
  let syncedMetadataCount = 0;

  for (const row of rows.contacts) {
    if (!staleIds.has(row.id)) continue;
    await upsertContact(row);
    if (missingIds.has(row.id)) insertedContactsCount += 1;
    else updatedContactsCount += 1;
  }

  for (const row of rows.metadata) {
    if (!staleIds.has(row.contact_id)) continue;
    await upsertMetadata(row);
    syncedMetadataCount += 1;
  }

  await writePBXPulsSystemEvent({
    event_type: 'directory_sql_sync_from_legacy_applied',
    severity: 'warning',
    source: 'pbxpuls_directory',
    message: 'Directory SQL sync from legacy applied',
    details: {
      actor,
      updatedContactsCount,
      insertedContactsCount,
      deletedContactsCount: 0,
      syncedMetadataCount
    }
  });

  return {
    ok: true,
    applied: true,
    applyEnabled: true,
    preview,
    updatedContactsCount,
    insertedContactsCount,
    deletedContactsCount: 0,
    syncedMetadataCount
  };
}
