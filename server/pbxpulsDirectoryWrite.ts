import crypto from 'crypto';
import mysql, { Connection, ResultSetHeader } from 'mysql2/promise';
import { isPBXPulsDbAvailable, sanitizePBXPulsDbError } from './pbxpulsDb.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';
import { getPBXPulsSetting } from './pbxpulsSettings.js';

export type DirectoryWriteMode = 'legacy' | 'sql';
export type DirectorySqlContactType = 'common' | 'personal';
export type DirectorySqlBusinessType = 'internal' | 'client' | 'supplier' | 'government';

export interface DirectorySqlActor {
  id?: string | number | null;
  username?: string | null;
  role?: string | null;
}

export interface DirectorySqlContactInput {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  number?: string | null;
  phone?: string | null;
  phone2?: string | null;
  phones?: unknown[] | null;
  email?: string | null;
  comment?: string | null;
  contact_type?: DirectorySqlContactType | string | null;
  contactType?: DirectorySqlContactType | string | null;
  visibility?: 'shared' | 'private' | string | null;
  owner_user_id?: string | null;
  ownerUserId?: string | null;
  type?: DirectorySqlBusinessType | string | null;
  isSpam?: boolean | number | string | null;
  is_spam?: boolean | number | string | null;
  isBlacklisted?: boolean | number | string | null;
  is_blacklisted?: boolean | number | string | null;
  metadata?: Record<string, unknown> | null;
  customFields?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface NormalizedDirectorySqlContact {
  id: string;
  name: string;
  company: string;
  phone: string;
  phone_normalized: string;
  phone2: string;
  email: string;
  comment: string | null;
  contact_type: DirectorySqlContactType;
  owner_user_id: string | null;
  visibility: 'shared' | 'private';
  type: DirectorySqlBusinessType;
  is_spam: number;
  is_blacklisted: number;
  created_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown>;
}

export interface DirectorySqlWriteResult {
  ok: boolean;
  contactId: string;
  contactType?: DirectorySqlContactType;
  metadataCount: number;
  warnings: string[];
}

type ExistingCustomField = {
  id: string;
  field_key: string;
};

const DIRECTORY_WRITE_MODE_KEY = 'directory.write_mode';
const DIRECTORY_METADATA_SAFE_KEYS = new Set([
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
]);

export async function getDirectoryWriteMode(): Promise<DirectoryWriteMode> {
  const mode = await getPBXPulsSetting<DirectoryWriteMode>(DIRECTORY_WRITE_MODE_KEY, 'legacy');
  return mode === 'sql' ? 'sql' : 'legacy';
}

export async function isDirectorySqlWriteLayerAvailable(): Promise<boolean> {
  return isPBXPulsDbAvailable();
}

export async function createDirectoryContactSql(input: DirectorySqlContactInput, actor: DirectorySqlActor | string): Promise<DirectorySqlWriteResult> {
  const normalized = normalizeDirectoryContactForSql(input, actor);
  validateDirectoryContactInput(normalized);

  let connection: Connection | null = null;
  try {
    connection = await createPBXPulsConnection();
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO directory_contacts
        (id, name, company, phone, phone_normalized, phone2, email, comment, contact_type, owner_user_id, visibility, type, is_spam, is_blacklisted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), COALESCE(?, NOW()))`,
      contactSqlParams(normalized)
    );

    const metadataResult = await upsertDirectoryMetadataWithConnection(connection, normalized.id, normalized.metadata);
    await connection.commit();

    await writeDirectoryContactAuditEvent('directory_sql_contact_created', normalized, actor, metadataResult.metadataCount);
    return {
      ok: true,
      contactId: normalized.id,
      contactType: normalized.contact_type,
      metadataCount: metadataResult.metadataCount,
      warnings: metadataResult.warnings
    };
  } catch (error: any) {
    if (connection) await rollbackQuietly(connection);
    throw new Error(`Directory SQL contact create failed: ${sanitizePBXPulsDbError(error)}`);
  } finally {
    if (connection) await connection.end();
  }
}

export async function updateDirectoryContactSql(id: string, input: DirectorySqlContactInput, actor: DirectorySqlActor | string): Promise<DirectorySqlWriteResult> {
  const contactId = safeText(id, 64);
  if (!contactId) throw new Error('Directory contact id is required');

  let connection: Connection | null = null;
  try {
    connection = await createPBXPulsConnection();
    await connection.beginTransaction();

    const existing = await selectDirectoryContactForUpdate(connection, contactId);
    if (!existing) throw new Error('Directory SQL contact not found');

    const normalized = normalizeDirectoryContactForSql({ ...existing, ...input, id: contactId }, actor);
    validateDirectoryContactInput(normalized);

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE directory_contacts
       SET name = ?, company = ?, phone = ?, phone_normalized = ?, phone2 = ?, email = ?, comment = ?,
           contact_type = ?, owner_user_id = ?, visibility = ?, type = ?, is_spam = ?, is_blacklisted = ?,
           updated_at = COALESCE(?, NOW())
       WHERE id = ?`,
      [
        normalized.name,
        normalized.company,
        normalized.phone,
        normalized.phone_normalized,
        normalized.phone2,
        normalized.email,
        normalized.comment,
        normalized.contact_type,
        normalized.owner_user_id,
        normalized.visibility,
        normalized.type,
        normalized.is_spam,
        normalized.is_blacklisted,
        normalized.updated_at,
        normalized.id
      ]
    );

    if (Number(result.affectedRows || 0) < 1) throw new Error('Directory SQL contact update affected no rows');

    const metadataResult = await upsertDirectoryMetadataWithConnection(connection, normalized.id, normalized.metadata);
    await connection.commit();

    await writeDirectoryContactAuditEvent('directory_sql_contact_updated', normalized, actor, metadataResult.metadataCount);
    return {
      ok: true,
      contactId: normalized.id,
      contactType: normalized.contact_type,
      metadataCount: metadataResult.metadataCount,
      warnings: metadataResult.warnings
    };
  } catch (error: any) {
    if (connection) await rollbackQuietly(connection);
    throw new Error(`Directory SQL contact update failed: ${sanitizePBXPulsDbError(error)}`);
  } finally {
    if (connection) await connection.end();
  }
}

export async function deleteDirectoryContactSql(id: string, actor: DirectorySqlActor | string): Promise<DirectorySqlWriteResult> {
  const contactId = safeText(id, 64);
  if (!contactId) throw new Error('Directory contact id is required');

  let connection: Connection | null = null;
  try {
    connection = await createPBXPulsConnection();
    await connection.beginTransaction();

    const existing = await selectDirectoryContactForUpdate(connection, contactId);
    if (!existing) throw new Error('Directory SQL contact not found');

    const [result] = await connection.execute<ResultSetHeader>(
      'DELETE FROM directory_contacts WHERE id = ?',
      [contactId]
    );
    if (Number(result.affectedRows || 0) < 1) throw new Error('Directory SQL contact delete affected no rows');

    await connection.commit();

    await writeDirectoryContactAuditEvent('directory_sql_contact_deleted', {
      id: contactId,
      contact_type: normalizeContactType(existing),
      metadata: {}
    }, actor, 0);

    return {
      ok: true,
      contactId,
      contactType: normalizeContactType(existing),
      metadataCount: 0,
      warnings: []
    };
  } catch (error: any) {
    if (connection) await rollbackQuietly(connection);
    throw new Error(`Directory SQL contact delete failed: ${sanitizePBXPulsDbError(error)}`);
  } finally {
    if (connection) await connection.end();
  }
}

export async function upsertDirectoryContactMetadataSql(
  contactId: string,
  metadata: Record<string, unknown>,
  actor: DirectorySqlActor | string
): Promise<DirectorySqlWriteResult> {
  const normalizedContactId = safeText(contactId, 64);
  if (!normalizedContactId) throw new Error('Directory contact id is required');

  let connection: Connection | null = null;
  try {
    connection = await createPBXPulsConnection();
    await connection.beginTransaction();

    const existing = await selectDirectoryContactForUpdate(connection, normalizedContactId);
    if (!existing) throw new Error('Directory SQL contact not found');

    const metadataResult = await upsertDirectoryMetadataWithConnection(connection, normalizedContactId, metadata);
    await connection.commit();

    await writeDirectoryContactAuditEvent('directory_sql_contact_updated', {
      id: normalizedContactId,
      contact_type: normalizeContactType(existing),
      metadata: {}
    }, actor, metadataResult.metadataCount);

    return {
      ok: true,
      contactId: normalizedContactId,
      contactType: normalizeContactType(existing),
      metadataCount: metadataResult.metadataCount,
      warnings: metadataResult.warnings
    };
  } catch (error: any) {
    if (connection) await rollbackQuietly(connection);
    throw new Error(`Directory SQL contact metadata update failed: ${sanitizePBXPulsDbError(error)}`);
  } finally {
    if (connection) await connection.end();
  }
}

export function validateDirectoryContactInput(input: DirectorySqlContactInput | NormalizedDirectorySqlContact): { ok: true } {
  const normalized = isNormalizedDirectoryContact(input)
    ? input
    : normalizeDirectoryContactForSql(input, {});

  if (!normalized.id) throw new Error('Directory contact id is required');
  if (normalized.contact_type !== 'common' && normalized.contact_type !== 'personal') {
    throw new Error('Directory contact type must be common or personal');
  }
  if (normalized.contact_type === 'personal' && !normalized.owner_user_id) {
    throw new Error('Personal Directory contacts require owner_user_id');
  }
  if (normalized.contact_type === 'common' && normalized.owner_user_id !== null) {
    throw new Error('Common Directory contacts must not have owner_user_id');
  }
  if (!(normalized.name || normalized.company)) {
    throw new Error('Directory contact requires name or company');
  }
  if (!(normalized.phone || normalized.email)) {
    throw new Error('Directory contact requires phone or email');
  }

  return { ok: true };
}

export function normalizeDirectoryContactForSql(
  input: DirectorySqlContactInput,
  actor: DirectorySqlActor | string = {}
): NormalizedDirectorySqlContact {
  const contactType = normalizeContactType(input);
  const phones = getDirectoryPhones(input);
  const primaryPhone = safeText(phones[0] || input.phone || input.number, 64);
  const ownerUserId = contactType === 'personal'
    ? safeNullableText(input.owner_user_id || input.ownerUserId || getActorOwnerId(actor), 64)
    : null;
  const now = normalizeSqlDate(input.updatedAt) || currentSqlDate();

  return {
    id: safeText(input.id, 64) || generateDirectoryContactId(),
    name: safeText(input.name, 255),
    company: safeText(input.company, 255),
    phone: primaryPhone,
    phone_normalized: normalizePhoneForSql(primaryPhone),
    phone2: safeText(phones[1] || input.phone2, 255),
    email: safeText(input.email, 255),
    comment: nullableText(input.comment, 65535),
    contact_type: contactType,
    owner_user_id: ownerUserId,
    visibility: contactType === 'personal' ? 'private' : 'shared',
    type: normalizeBusinessType(input.type),
    is_spam: truthyFlag(input.isSpam ?? input.is_spam) ? 1 : 0,
    is_blacklisted: truthyFlag(input.isBlacklisted ?? input.is_blacklisted) ? 1 : 0,
    created_at: normalizeSqlDate(input.createdAt),
    updated_at: now,
    metadata: normalizeMetadataInput(input)
  };
}

async function createPBXPulsConnection(): Promise<Connection> {
  return mysql.createConnection({
    host: process.env.PBXPULS_DB_HOST || '127.0.0.1',
    port: Number(process.env.PBXPULS_DB_PORT || 3306),
    user: process.env.PBXPULS_DB_USER || 'pbxpuls',
    password: process.env.PBXPULS_DB_PASS || '',
    database: process.env.PBXPULS_DB_NAME || 'pbxpuls',
    connectTimeout: 5000,
    dateStrings: true
  });
}

function contactSqlParams(contact: NormalizedDirectorySqlContact): unknown[] {
  return [
    contact.id,
    contact.name,
    contact.company,
    contact.phone,
    contact.phone_normalized,
    contact.phone2,
    contact.email,
    contact.comment,
    contact.contact_type,
    contact.owner_user_id,
    contact.visibility,
    contact.type,
    contact.is_spam,
    contact.is_blacklisted,
    contact.created_at,
    contact.updated_at
  ];
}

async function selectDirectoryContactForUpdate(connection: Connection, contactId: string): Promise<any | null> {
  const [rows] = await connection.execute<any[]>(
    `SELECT id, name, company, phone, phone2, email, comment, contact_type, owner_user_id,
            visibility, type, is_spam, is_blacklisted, created_at, updated_at
     FROM directory_contacts
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [contactId]
  );
  return rows[0] || null;
}

async function upsertDirectoryMetadataWithConnection(
  connection: Connection,
  contactId: string,
  metadata: Record<string, unknown>
): Promise<{ metadataCount: number; warnings: string[] }> {
  const normalizedMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const keys = Object.keys(normalizedMetadata).map(key => safeText(key, 100)).filter(Boolean);
  if (!keys.length) return { metadataCount: 0, warnings: [] };

  const customFields = await selectExistingCustomFields(connection, keys);
  const warnings: string[] = [];
  let metadataCount = 0;

  for (const key of keys) {
    const customField = customFields.get(key) || null;
    if (!customField && !DIRECTORY_METADATA_SAFE_KEYS.has(key)) {
      warnings.push(`metadata_field_not_defined:${key}`);
      continue;
    }

    const value = normalizedMetadata[key];
    const isStructured = Array.isArray(value) || (value && typeof value === 'object');
    const scalarValue = isStructured ? null : safeText(value, 65535);
    const jsonValue = isStructured ? JSON.stringify(value) : null;

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO directory_contact_metadata
        (contact_id, field_id, value, metadata_key, metadata_value, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
        field_id = VALUES(field_id),
        value = VALUES(value),
        metadata_value = VALUES(metadata_value),
        metadata_json = VALUES(metadata_json),
        updated_at = NOW()`,
      [
        contactId,
        customField?.id || null,
        customField ? scalarValue : null,
        key,
        scalarValue,
        jsonValue
      ]
    );

    if (Number(result.affectedRows || 0) > 0) metadataCount += 1;
  }

  return { metadataCount, warnings };
}

async function selectExistingCustomFields(connection: Connection, fieldKeys: string[]): Promise<Map<string, ExistingCustomField>> {
  const uniqueKeys = Array.from(new Set(fieldKeys));
  if (!uniqueKeys.length) return new Map();

  const placeholders = uniqueKeys.map(() => '?').join(', ');
  const [rows] = await connection.execute<any[]>(
    `SELECT id, field_key
     FROM directory_custom_fields
     WHERE entity_type = 'directory_contact'
       AND field_key IN (${placeholders})`,
    uniqueKeys
  );

  return new Map(rows.map(row => [String(row.field_key || ''), {
    id: String(row.id || ''),
    field_key: String(row.field_key || '')
  }]));
}

async function writeDirectoryContactAuditEvent(
  eventType: string,
  contact: Pick<NormalizedDirectorySqlContact, 'id' | 'contact_type' | 'metadata'>,
  actor: DirectorySqlActor | string,
  metadataCount: number
): Promise<void> {
  await writePBXPulsSystemEvent({
    event_type: eventType,
    severity: 'info',
    source: 'pbxpuls_directory_write',
    message: 'Directory SQL write layer operation',
    details: {
      contactId: safeText(contact.id, 64),
      contactType: contact.contact_type,
      actor: getActorLabel(actor),
      metadataCount
    }
  });
}

async function rollbackQuietly(connection: Connection): Promise<void> {
  try {
    await connection.rollback();
  } catch (_error) {
    // Keep the original SQL error as the actionable failure.
  }
}

function isNormalizedDirectoryContact(input: DirectorySqlContactInput | NormalizedDirectorySqlContact): input is NormalizedDirectorySqlContact {
  return Object.prototype.hasOwnProperty.call(input, 'phone_normalized')
    && Object.prototype.hasOwnProperty.call(input, 'contact_type');
}

function normalizeContactType(input: any): DirectorySqlContactType {
  const raw = String(input?.contact_type || input?.contactType || input?.visibility || '').trim().toLowerCase();
  return raw === 'personal' || raw === 'private' || raw === 'личный' ? 'personal' : 'common';
}

function normalizeBusinessType(value: unknown): DirectorySqlBusinessType {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'internal' || raw === 'supplier' || raw === 'government') return raw;
  return 'client';
}

function normalizeMetadataInput(input: DirectorySqlContactInput): Record<string, unknown> {
  return {
    ...(input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata) ? input.metadata : {}),
    ...(input.customFields && typeof input.customFields === 'object' && !Array.isArray(input.customFields) ? input.customFields : {})
  };
}

function getDirectoryPhones(input: DirectorySqlContactInput): string[] {
  const values = [
    ...(Array.isArray(input.phones) ? input.phones : []),
    input.number,
    input.phone,
    input.phone2
  ];
  const out: string[] = [];
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    raw.split(/[;,|\n]+/).forEach(part => {
      const phone = safeText(part, 255);
      if (phone && !out.includes(phone)) out.push(phone);
    });
  }
  return out;
}

function normalizePhoneForSql(value: unknown): string {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  return digits.slice(0, 32);
}

function getActorOwnerId(actor: DirectorySqlActor | string): string {
  if (typeof actor === 'string') return actor;
  return String(actor?.id || actor?.username || actor?.role || '').trim();
}

function getActorLabel(actor: DirectorySqlActor | string): string {
  if (typeof actor === 'string') return safeText(actor, 64);
  return safeText(actor?.role || actor?.username || actor?.id || 'unknown', 64);
}

function truthyFlag(value: unknown): boolean {
  const raw = String(value ?? '').trim().toLowerCase();
  return value === true || ['1', 'true', 'yes', 'да', 'y'].includes(raw);
}

function normalizeSqlDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function currentSqlDate(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function generateDirectoryContactId(): string {
  return `dir_${crypto.randomBytes(12).toString('hex')}`;
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

function nullableText(value: unknown, maxLength: number): string | null {
  const text = safeText(value, maxLength);
  return text || null;
}

function safeNullableText(value: unknown, maxLength: number): string | null {
  const text = safeText(value, maxLength);
  return text || null;
}
