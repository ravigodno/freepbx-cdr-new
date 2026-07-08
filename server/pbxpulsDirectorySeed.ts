import crypto from 'crypto';
import fs from 'fs';
import { Connection } from 'mysql2/promise';
import { queryPBXPulsDb, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';

type DirectoryContactSeedRow = {
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

type DirectoryCustomFieldSeedRow = {
  id: string;
  field_key: string;
  field_name: string;
  field_type: 'string' | 'text' | 'number' | 'date' | 'boolean' | 'select' | 'phone' | 'email';
};

type DirectoryMetadataSeedRow = {
  contact_id: string;
  field_id: string | null;
  value: string | null;
  metadata_key: string;
  metadata_value: string | null;
  metadata_json: string | null;
};

type DirectorySeedRows = {
  contacts: DirectoryContactSeedRow[];
  customFields: DirectoryCustomFieldSeedRow[];
  metadata: DirectoryMetadataSeedRow[];
  skippedCount: number;
  duplicatePhones: number;
};

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

const DIRECTORY_CORE_FIELDS = new Set([
  'id',
  'name',
  'number',
  'phone',
  'phone1',
  'phone2',
  'phone3',
  'phones',
  'fio',
  'fullname',
  'contact',
  'type',
  'visibility',
  'ownerUserId',
  'ownerId',
  'userId',
  'company',
  'organization',
  'org',
  'position',
  'job',
  'title',
  'department',
  'group',
  'team',
  'email',
  'website',
  'site',
  'inn',
  'ИНН',
  'kpp',
  'КПП',
  'ogrn',
  'ОГРН',
  'address',
  'адрес',
  'internalExtension',
  'extension',
  'internal_number',
  'linkedExternalNumber',
  'externalNumber',
  'linked_external_number',
  'responsibleUserId',
  'responsible',
  'tags',
  'tag',
  'isSpam',
  'is_spam',
  'isBlacklisted',
  'is_blacklisted',
  'comment',
  'notes',
  'createdAt',
  'updatedAt'
]);

export const DIRECTORY_SQL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS directory_contacts (
    id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    company VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(64) NOT NULL DEFAULT '',
    phone_normalized VARCHAR(32) NOT NULL DEFAULT '',
    phone2 VARCHAR(255) NOT NULL DEFAULT '',
    email VARCHAR(255) NOT NULL DEFAULT '',
    comment TEXT NULL,
    contact_type ENUM('common', 'personal') NOT NULL DEFAULT 'common',
    owner_user_id VARCHAR(64) NULL,
    visibility ENUM('shared', 'private') NULL,
    type ENUM('internal', 'client', 'supplier', 'government') NOT NULL DEFAULT 'client',
    is_spam TINYINT(1) NOT NULL DEFAULT 0,
    is_blacklisted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NULL,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    INDEX idx_directory_contacts_phone_normalized (phone_normalized),
    INDEX idx_directory_contacts_owner_user_id (owner_user_id),
    INDEX idx_directory_contacts_contact_type (contact_type),
    INDEX idx_directory_contacts_company (company),
    INDEX idx_directory_contacts_name (name),
    INDEX idx_directory_contacts_type_owner (contact_type, owner_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS directory_custom_fields (
    id VARCHAR(64) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_name VARCHAR(255) NOT NULL,
    field_type ENUM('string', 'text', 'number', 'date', 'boolean', 'select', 'phone', 'email') NOT NULL DEFAULT 'string',
    entity_type VARCHAR(64) NOT NULL DEFAULT 'directory_contact',
    is_required TINYINT(1) NOT NULL DEFAULT 0,
    is_visible TINYINT(1) NOT NULL DEFAULT 1,
    visibility ENUM('common', 'personal', 'private') NOT NULL DEFAULT 'common',
    sort_order INT NOT NULL DEFAULT 100,
    show_in_card TINYINT(1) NOT NULL DEFAULT 1,
    show_in_search TINYINT(1) NOT NULL DEFAULT 0,
    show_in_caller_popup TINYINT(1) NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NULL,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_directory_custom_fields_key (entity_type, field_key),
    INDEX idx_directory_custom_fields_entity (entity_type),
    INDEX idx_directory_custom_fields_visibility (visibility),
    INDEX idx_directory_custom_fields_sort_order (sort_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS directory_contact_metadata (
    id BIGINT NOT NULL AUTO_INCREMENT,
    contact_id VARCHAR(64) NOT NULL,
    field_id VARCHAR(64) NULL,
    value LONGTEXT NULL,
    metadata_key VARCHAR(100) NULL,
    metadata_value TEXT NULL,
    metadata_json LONGTEXT NULL,
    created_at DATETIME NULL,
    updated_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uniq_directory_contact_metadata_field (contact_id, field_id),
    UNIQUE KEY uniq_directory_contact_metadata_key (contact_id, metadata_key),
    INDEX idx_directory_contact_metadata_contact_id (contact_id),
    INDEX idx_directory_contact_metadata_field_id (field_id),
    INDEX idx_directory_contact_metadata_key (metadata_key),
    CONSTRAINT fk_directory_contact_metadata_contact
      FOREIGN KEY (contact_id) REFERENCES directory_contacts (id)
      ON DELETE CASCADE,
    CONSTRAINT fk_directory_contact_metadata_field
      FOREIGN KEY (field_id) REFERENCES directory_custom_fields (id)
      ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

const safeText = (value: unknown, maxLength: number): string => String(value ?? '').trim().slice(0, maxLength);
const nullableText = (value: unknown, maxLength: number): string | null => {
  const text = safeText(value, maxLength);
  return text ? text : null;
};

const isSensitiveDirectoryField = (fieldKey: string): boolean => (
  /(password|passwd|token|secret|api[_-]?key|credential|private[_-]?key)/i.test(fieldKey)
);

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

const normalizePhoneForSql = (value: unknown): string => {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits.slice(0, 32);
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

const customFieldId = (fieldKey: string): string => `dir_cf_${crypto.createHash('sha1').update(fieldKey).digest('hex').slice(0, 16)}`;

function buildDirectorySeedRows(legacyDb: any): DirectorySeedRows {
  const directory = Array.isArray(legacyDb?.directory) ? legacyDb.directory : [];
  const contacts: DirectoryContactSeedRow[] = [];
  const customFieldsByKey = new Map<string, DirectoryCustomFieldSeedRow>();
  const metadata: DirectoryMetadataSeedRow[] = [];
  const phoneCounts = new Map<string, number>();
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
    const phoneNormalized = normalizePhoneForSql(primaryPhone);
    if (phoneNormalized) {
      phoneCounts.set(phoneNormalized, (phoneCounts.get(phoneNormalized) || 0) + 1);
    }

    const rawType = safeText(entry?.type, 32).toLowerCase();
    const directoryType = DIRECTORY_ALLOWED_TYPES.has(rawType) ? rawType as DirectoryContactSeedRow['type'] : 'client';
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
      phone_normalized: phoneNormalized,
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

    Object.keys(entry || {}).forEach((fieldKey) => {
      if (DIRECTORY_CORE_FIELDS.has(fieldKey) || isSensitiveDirectoryField(fieldKey)) return;
      const value = entry[fieldKey];
      if (value === undefined || value === null || value === '') return;
      const field_id = customFieldId(fieldKey);
      if (!customFieldsByKey.has(fieldKey)) {
        customFieldsByKey.set(fieldKey, {
          id: field_id,
          field_key: safeText(fieldKey, 100),
          field_name: safeText(fieldKey, 255),
          field_type: 'text'
        });
      }
      const isStructured = Array.isArray(value) || (typeof value === 'object' && value !== null);
      metadata.push({
        contact_id: id,
        field_id,
        value: isStructured ? null : safeText(value, 65535),
        metadata_key: safeText(fieldKey, 100),
        metadata_value: isStructured ? null : safeText(value, 65535),
        metadata_json: isStructured ? JSON.stringify(value) : null
      });
    });
  }

  return {
    contacts,
    customFields: Array.from(customFieldsByKey.values()).sort((a, b) => a.field_key.localeCompare(b.field_key)),
    metadata,
    skippedCount,
    duplicatePhones: Array.from(phoneCounts.values()).filter(count => count > 1).length
  };
}

async function selectExistingIds(tableName: string, columnName: string, values: string[]): Promise<Set<string>> {
  if (!values.length) return new Set();
  const placeholders = values.map(() => '?').join(', ');
  const rows = await queryPBXPulsDb(`SELECT ${columnName} AS value FROM ${tableName} WHERE ${columnName} IN (${placeholders})`, values);
  return new Set(rows.map(row => String(row.value || '')));
}

export async function buildDirectorySeedPreview(legacyDb: any) {
  const rows = buildDirectorySeedRows(legacyDb);
  let existingContacts = new Set<string>();
  let existingCustomFields = new Set<string>();
  let existingMetadata = new Set<string>();
  let sqlAvailable = true;
  let sqlError: string | null = null;

  try {
    existingContacts = await selectExistingIds('directory_contacts', 'id', rows.contacts.map(row => row.id));
    existingCustomFields = await selectExistingIds('directory_custom_fields', 'field_key', rows.customFields.map(row => row.field_key));
    const contactIds = Array.from(new Set(rows.metadata.map(row => row.contact_id)));
    if (contactIds.length) {
      const placeholders = contactIds.map(() => '?').join(', ');
      const metadataRows = await queryPBXPulsDb(
        `SELECT contact_id, metadata_key FROM directory_contact_metadata WHERE contact_id IN (${placeholders})`,
        contactIds
      );
      existingMetadata = new Set(metadataRows.map(row => `${row.contact_id}:${row.metadata_key}`));
    }
  } catch (error: any) {
    sqlAvailable = false;
    sqlError = sanitizePBXPulsDbError(error);
  }

  const metadataKeys = rows.metadata.map(row => `${row.contact_id}:${row.metadata_key}`);
  const duplicateMetadataKeys = metadataKeys.length - new Set(metadataKeys).size;
  const metadataExistingCount = rows.metadata.filter(row => existingMetadata.has(`${row.contact_id}:${row.metadata_key}`)).length;

  return {
    ok: true,
    source: 'data/db.json',
    sqlAvailable,
    contacts: {
      legacyTotal: Array.isArray(legacyDb?.directory) ? legacyDb.directory.length : 0,
      willAdd: sqlAvailable ? rows.contacts.filter(row => !existingContacts.has(row.id)).length : rows.contacts.length,
      skippedExisting: sqlAvailable ? rows.contacts.filter(row => existingContacts.has(row.id)).length : 0,
      skippedInvalid: rows.skippedCount
    },
    customFields: {
      willAdd: sqlAvailable ? rows.customFields.filter(row => !existingCustomFields.has(row.field_key)).length : rows.customFields.length,
      skippedExisting: sqlAvailable ? rows.customFields.filter(row => existingCustomFields.has(row.field_key)).length : 0
    },
    metadata: {
      willAdd: sqlAvailable ? rows.metadata.length - metadataExistingCount - duplicateMetadataKeys : rows.metadata.length - duplicateMetadataKeys,
      skippedExisting: sqlAvailable ? metadataExistingCount : 0,
      duplicateKeys: duplicateMetadataKeys
    },
    duplicates: {
      normalizedPhones: rows.duplicatePhones
    },
    safe: true,
    valuesReturned: false,
    error: sqlError
  };
}

async function executeInsertIgnore(connection: Connection, sql: string, params: any[]): Promise<number> {
  const [result] = await connection.execute(sql, params);
  return Number((result as any)?.affectedRows || 0);
}

export async function seedLegacyDirectory(connection: Connection): Promise<void> {
  const legacyPath = `${process.cwd()}/data/db.json`;
  if (!fs.existsSync(legacyPath)) {
    console.warn('[PBXPULS_DB] legacy directory seed skipped: data/db.json not found');
    return;
  }

  const legacyDb = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  const rows = buildDirectorySeedRows(legacyDb);
  let contactsCount = 0;
  let customFieldsCount = 0;
  let metadataCount = 0;

  for (const row of rows.contacts) {
    contactsCount += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO directory_contacts
        (id, name, company, phone, phone_normalized, phone2, email, comment, contact_type, owner_user_id, visibility, type, is_spam, is_blacklisted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  for (const row of rows.customFields) {
    customFieldsCount += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO directory_custom_fields
        (id, field_key, field_name, field_type, entity_type, is_required, is_visible, visibility, sort_order, show_in_card, show_in_search, show_in_caller_popup, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'directory_contact', 0, 1, 'private', 100, 1, 0, 0, NOW(), NOW())`,
      [row.id, row.field_key, row.field_name, row.field_type]
    );
  }

  for (const row of rows.metadata) {
    metadataCount += await executeInsertIgnore(connection,
      `INSERT IGNORE INTO directory_contact_metadata
        (contact_id, field_id, value, metadata_key, metadata_value, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        row.contact_id,
        row.field_id,
        row.value,
        row.metadata_key,
        row.metadata_value,
        row.metadata_json
      ]
    );
  }

  const skippedCount = rows.skippedCount
    + (rows.contacts.length - contactsCount)
    + (rows.customFields.length - customFieldsCount)
    + (rows.metadata.length - metadataCount);

  await writePBXPulsSystemEvent({
    event_type: 'directory_seed_completed',
    severity: 'info',
    source: 'pbxpuls_directory_migration',
    message: 'Legacy Directory seed completed',
    details: {
      contactsCount,
      customFieldsCount,
      metadataCount,
      skippedCount
    }
  });

  console.log('[PBXPULS_DB] legacy directory seed applied:', {
    contactsCount,
    customFieldsCount,
    metadataCount,
    skippedCount
  });
}
