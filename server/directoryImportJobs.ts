import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Express, type Request, type RequestHandler } from 'express';
import mysql, { type Connection, type ResultSetHeader } from 'mysql2/promise';
import { parseDirectoryCsv, validateDirectoryPhone } from '../shared/directoryImportValidation.js';
import { getPBXPulsDbConnectionOptions } from './pbxpulsDbConfig.js';
import { createUniqueDirectoryContactId } from './directoryContactIds.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';

type AtomicityMode = 'rollback_on_error' | 'partial';
type DuplicateStrategy = 'skip' | 'update' | 'create';
type CancelMode = 'preserve' | 'rollback';

type ImportRow = {
  rowNumber: number;
  fingerprint: string;
  name: string;
  company: string;
  position: string;
  phone: string;
  phoneNormalized: string;
  phone2: string;
  email: string;
  comment: string;
  contactType: 'common' | 'personal';
  ownerUserId: string | null;
  visibility: 'shared' | 'private';
  type: 'internal' | 'client' | 'supplier' | 'government';
  isSpam: number;
  isBlacklisted: number;
  metadata: Record<string, unknown>;
};

type JobRow = {
  id: string;
  source_filename: string;
  source_hash: string;
  source_path: string;
  total_rows: number;
  processed_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  duplicate_rows: number;
  failed_rows: number;
  current_row: number;
  status: string;
  cancel_requested: number;
  cancel_mode: CancelMode | null;
  started_by: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  error_code: string | null;
  error_row: number | null;
  error_message: string | null;
  mode: string;
  duplicate_strategy: DuplicateStrategy;
  batch_size: number;
  atomicity_mode: AtomicityMode;
  rollback_status: string | null;
  rolled_back_rows: number;
};

type RegisterDependencies = {
  requireAuth: RequestHandler;
  hasPermission: (req: Request, permission: string) => Promise<boolean>;
};

const runningJobs = new Set<string>();
const DIRECTORY_IMPORT_ROOT = process.env.PBXPULS_DIRECTORY_IMPORT_ROOT || '/var/lib/pbxpuls/directory-imports';
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const allowedStatuses = new Set(['queued', 'validating', 'importing', 'cancelling', 'cancelled', 'completed', 'failed', 'completed_with_errors']);

const safeText = (value: unknown, maxLength = 255): string => String(value ?? '').trim().slice(0, maxLength);
const nowSql = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ');
const sha256 = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');
const normalizeEmail = (value: unknown): string => safeText(value, 255).toLowerCase();
const boolValue = (value: unknown): boolean => value === true || ['1', 'true', 'yes', 'да', 'y'].includes(safeText(value, 20).toLowerCase());
const safeImportErrorMessage = (error: any): string => {
  const code = safeText(error?.code || error?.message || 'IMPORT_FAILED', 64).toUpperCase();
  if (code.includes('CSV_') || code.includes('SOURCE_') || code.includes('PHONE_') || code === 'REQUIRED_FIELDS_MISSING') {
    return 'Структура или данные CSV не прошли проверку.';
  }
  if (code.includes('DUP') || code.includes('ER_DUP_ENTRY')) return 'Внутренняя ошибка уникального идентификатора.';
  if (code.includes('TIMEOUT') || code.includes('CONNECTION')) return 'Соединение с базой данных временно недоступно.';
  return 'Импорт остановлен из-за внутренней ошибки. Технические сведения доступны администратору.';
};

const isAllowed = async (req: Request, deps: RegisterDependencies, permission: string): Promise<boolean> => {
  const user = (req as any).user;
  return user?.role === 'su' || user?.role === 'admin' || deps.hasPermission(req, permission);
};

const actorLabel = (req: Request): string => {
  const user = (req as any).user || {};
  return safeText(user.id || user.username || user.role || 'unknown', 100);
};

const parseImportRows = (content: string): { rows: ImportRow[]; errors: Array<{ rowNumber: number; code: string; message: string }> } => {
  const csv = parseDirectoryCsv(content);
  if (csv.rows.length < 2) throw new Error('CSV_EMPTY');
  const headers = csv.rows[0].values.map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase());
  const indexOf = (...names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(name.toLowerCase());
      if (index >= 0) return index;
    }
    return -1;
  };
  const get = (values: string[], ...names: string[]) => {
    const index = indexOf(...names);
    return index >= 0 ? safeText(values[index], 4000) : '';
  };
  if (indexOf('phone', 'phone1', 'телефон') < 0 && indexOf('email', 'почта') < 0) throw new Error('CSV_REQUIRED_COLUMNS_MISSING');

  const rows: ImportRow[] = [];
  const errors: Array<{ rowNumber: number; code: string; message: string }> = [];
  for (const csvRow of csv.rows.slice(1)) {
    const values = csvRow.values;
    if (values.length !== headers.length) {
      errors.push({ rowNumber: csvRow.rowNumber, code: 'CSV_COLUMN_MISMATCH', message: `Ожидалось ${headers.length} столбцов, получено ${values.length}` });
      continue;
    }
    const name = get(values, 'fullname', 'name', 'фио');
    const company = get(values, 'organization', 'company', 'организация');
    const rawPhone = get(values, 'phone', 'phone1', 'телефон');
    const phoneValidation = validateDirectoryPhone(rawPhone);
    const email = normalizeEmail(get(values, 'email', 'почта'));
    if ((!name && !company) || (!rawPhone && !email)) {
      errors.push({ rowNumber: csvRow.rowNumber, code: 'REQUIRED_FIELDS_MISSING', message: 'Нужны ФИО/организация и телефон/email' });
      continue;
    }
    if (rawPhone && !phoneValidation.valid) {
      errors.push({ rowNumber: csvRow.rowNumber, code: `PHONE_${phoneValidation.reason || 'INVALID'}`, message: 'Некорректный телефон' });
      continue;
    }
    const visibility = ['private', 'личный'].includes(get(values, 'visibility', 'видимость').toLowerCase()) ? 'private' : 'shared';
    const rawType = get(values, 'type', 'тип').toLowerCase();
    const type = (['internal', 'client', 'supplier', 'government'].includes(rawType) ? rawType : 'client') as ImportRow['type'];
    const phone2 = get(values, 'phone2', 'телефон2');
    const tags = get(values, 'tags', 'теги').split(/[;,|]+/).map(value => value.trim()).filter(Boolean);
    const metadata = {
      phones: [rawPhone, phone2].filter(Boolean),
      position: get(values, 'position', 'должность'),
      department: get(values, 'department', 'отдел'),
      group: get(values, 'group', 'группа'),
      website: get(values, 'website', 'сайт'),
      inn: get(values, 'inn', 'инн'),
      kpp: get(values, 'kpp', 'кпп'),
      ogrn: get(values, 'ogrn', 'огрн'),
      address: get(values, 'address', 'адрес'),
      internalExtension: get(values, 'internalextension', 'внутренний номер', 'extension'),
      linkedExternalNumber: get(values, 'linkedexternalnumber', 'связанный внешний номер'),
      responsibleUserId: get(values, 'responsibleuserid', 'ответственный сотрудник'),
      tags
    };
    const stable = {
      name,
      company,
      phone: phoneValidation.digits,
      email,
      comment: get(values, 'comment', 'комментарий'),
      metadata
    };
    rows.push({
      rowNumber: csvRow.rowNumber,
      fingerprint: sha256(JSON.stringify(stable)),
      name,
      company,
      position: String(metadata.position || ''),
      phone: rawPhone,
      phoneNormalized: phoneValidation.digits,
      phone2,
      email,
      comment: stable.comment,
      contactType: visibility === 'private' ? 'personal' : 'common',
      ownerUserId: null,
      visibility,
      type,
      isSpam: boolValue(get(values, 'isspam', 'is_spam', 'спам')) ? 1 : 0,
      isBlacklisted: boolValue(get(values, 'isblacklisted', 'is_blacklisted')) ? 1 : 0,
      metadata
    });
  }
  return { rows, errors };
};

export const parseDirectoryImportRowsForTest = parseImportRows;

const getConnection = (): Promise<Connection> => mysql.createConnection(getPBXPulsDbConnectionOptions());

const selectJob = async (connection: Connection, jobId: string): Promise<JobRow | null> => {
  const [rows] = await connection.execute<any[]>('SELECT * FROM directory_import_jobs WHERE id=? LIMIT 1', [jobId]);
  return rows[0] || null;
};

const safeJob = (job: JobRow) => {
  const elapsedSeconds = job.started_at ? Math.max(0.001, (Date.now() - new Date(job.started_at).getTime()) / 1000) : 0;
  const speedRowsPerSecond = elapsedSeconds ? Number(job.processed_rows || 0) / elapsedSeconds : 0;
  const remainingRows = Math.max(0, Number(job.total_rows || 0) - Number(job.processed_rows || 0));
  return {
    id: job.id,
    sourceFilename: job.source_filename,
    sourceHash: job.source_hash,
    totalRows: Number(job.total_rows || 0),
    processedRows: Number(job.processed_rows || 0),
    insertedRows: Number(job.inserted_rows || 0),
    updatedRows: Number(job.updated_rows || 0),
    skippedRows: Number(job.skipped_rows || 0),
    duplicateRows: Number(job.duplicate_rows || 0),
    failedRows: Number(job.failed_rows || 0),
    currentRow: Number(job.current_row || 0),
    status: allowedStatuses.has(job.status) ? job.status : 'failed',
    cancelRequested: job.cancel_requested === 1,
    cancelMode: job.cancel_mode,
    startedAt: job.started_at,
    updatedAt: job.updated_at,
    finishedAt: job.finished_at,
    errorCode: job.error_code,
    errorRow: job.error_row,
    errorMessage: job.error_message,
    mode: job.mode,
    duplicateStrategy: job.duplicate_strategy,
    batchSize: Number(job.batch_size || 500),
    atomicityMode: job.atomicity_mode,
    rollbackStatus: job.rollback_status,
    rolledBackRows: Number(job.rolled_back_rows || 0),
    speedRowsPerSecond: Math.round(speedRowsPerSecond * 10) / 10,
    etaSeconds: speedRowsPerSecond > 0 ? Math.ceil(remainingRows / speedRowsPerSecond) : null,
    percent: job.total_rows > 0 ? Math.min(100, Math.round(job.processed_rows / job.total_rows * 1000) / 10) : 0
  };
};

const insertJobRows = async (connection: Connection, jobId: string, rows: Array<{ rowNumber: number; fingerprint: string; contactId: string | null; status: string; errorCode?: string; errorMessage?: string }>) => {
  if (!rows.length) return;
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
  const timestamp = nowSql();
  const values = rows.flatMap(row => [jobId, row.rowNumber, row.fingerprint, row.contactId, row.status, row.errorCode || null, safeText(row.errorMessage, 500) || null, timestamp, timestamp]);
  await connection.execute(
    `INSERT INTO directory_import_job_rows(job_id,row_number,row_fingerprint,contact_id,status,error_code,error_message,created_at,updated_at)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE contact_id=VALUES(contact_id),status=VALUES(status),error_code=VALUES(error_code),error_message=VALUES(error_message),updated_at=VALUES(updated_at)`,
    values
  );
};

const bulkInsertContacts = async (connection: Connection, job: JobRow, rows: Array<ImportRow & { contactId: string }>) => {
  if (!rows.length) return;
  const placeholders = rows.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
  const values = rows.flatMap(row => [
    row.contactId, row.name, row.company, row.phone, row.phoneNormalized, row.phone2, row.email, row.comment,
    row.contactType, row.ownerUserId, row.visibility, row.type, row.isSpam, row.isBlacklisted,
    job.id, row.rowNumber, row.fingerprint, nowSql(), nowSql()
  ]);
  await connection.execute(
    `INSERT INTO directory_contacts(
      id,name,company,phone,phone_normalized,phone2,email,comment,contact_type,owner_user_id,visibility,type,is_spam,is_blacklisted,
      import_job_id,import_row_number,import_row_fingerprint,created_at,updated_at
    ) VALUES ${placeholders}`,
    values
  );
  const metadataRows = rows.flatMap(row => Object.entries(row.metadata)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => [row.contactId, key, JSON.stringify(value), nowSql(), nowSql()]));
  if (metadataRows.length) {
    const metaPlaceholders = metadataRows.map(() => '(?,NULL,NULL,?,NULL,?,?,?)').join(',');
    await connection.execute(
      `INSERT INTO directory_contact_metadata(contact_id,field_id,value,metadata_key,metadata_value,metadata_json,created_at,updated_at)
       VALUES ${metaPlaceholders}`,
      metadataRows.flat()
    );
  }
};

const rollbackCreatedContacts = async (connection: Connection, jobId: string): Promise<number> => {
  await connection.beginTransaction();
  try {
    const [result] = await connection.execute<ResultSetHeader>('DELETE FROM directory_contacts WHERE import_job_id=?', [jobId]);
    const deleted = Number(result.affectedRows || 0);
    await connection.execute(
      `UPDATE directory_import_jobs SET rollback_status='completed',rolled_back_rows=?,updated_at=? WHERE id=?`,
      [deleted, nowSql(), jobId]
    );
    await connection.commit();
    return deleted;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

const updateExistingContact = async (connection: Connection, contactId: string, row: ImportRow) => {
  await connection.execute(
    `UPDATE directory_contacts SET name=?,company=?,phone=?,phone_normalized=?,phone2=?,email=?,comment=?,visibility=?,type=?,is_spam=?,is_blacklisted=?,updated_at=? WHERE id=?`,
    [row.name,row.company,row.phone,row.phoneNormalized,row.phone2,row.email,row.comment,row.visibility,row.type,row.isSpam,row.isBlacklisted,nowSql(),contactId]
  );
};

const markJobFailed = async (connection: Connection, job: JobRow, error: any, errorRow?: number) => {
  const errorCode = safeText(error?.code || error?.message || 'IMPORT_FAILED', 64).replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  let rolledBack = 0;
  if (job.atomicity_mode === 'rollback_on_error') rolledBack = await rollbackCreatedContacts(connection, job.id);
  await connection.execute(
    `UPDATE directory_import_jobs SET status='failed',error_code=?,error_row=?,error_message=?,rollback_status=?,rolled_back_rows=?,finished_at=?,updated_at=? WHERE id=?`,
    [errorCode, errorRow || null, safeImportErrorMessage(error), job.atomicity_mode === 'rollback_on_error' ? 'completed' : null, rolledBack, nowSql(), nowSql(), job.id]
  );
};

const processJob = async (jobId: string): Promise<void> => {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  let connection: Connection | null = null;
  try {
    connection = await getConnection();
    let job = await selectJob(connection, jobId);
    if (!job || !['queued', 'failed', 'cancelled'].includes(job.status)) return;
    await connection.execute(`UPDATE directory_import_jobs SET status='validating',started_at=COALESCE(started_at,?),finished_at=NULL,error_code=NULL,error_row=NULL,error_message=NULL,updated_at=? WHERE id=?`, [nowSql(), nowSql(), jobId]);
    const content = fs.readFileSync(job.source_path, 'utf8');
    if (sha256(content) !== job.source_hash) throw Object.assign(new Error('Import source hash changed'), { code: 'SOURCE_HASH_MISMATCH' });
    const parsed = parseImportRows(content);
    if (parsed.rows.length + parsed.errors.length !== job.total_rows) throw Object.assign(new Error('Import source row count changed'), { code: 'SOURCE_ROW_COUNT_MISMATCH' });
    if (parsed.errors.length && job.atomicity_mode === 'rollback_on_error') throw Object.assign(new Error(`Validation failed at row ${parsed.errors[0].rowNumber}`), { code: parsed.errors[0].code, rowNumber: parsed.errors[0].rowNumber });
    if (parsed.errors.length) {
      await insertJobRows(connection, job.id, parsed.errors.map(error => ({
        rowNumber: error.rowNumber,
        fingerprint: sha256(`invalid:${error.rowNumber}:${error.code}:${error.message}`),
        contactId: null,
        status: 'failed',
        errorCode: error.code,
        errorMessage: error.message
      })));
      await connection.execute(`UPDATE directory_import_jobs SET failed_rows=?,updated_at=? WHERE id=?`, [parsed.errors.length, nowSql(), job.id]);
    }
    await connection.execute(`UPDATE directory_import_jobs SET status='importing',updated_at=? WHERE id=?`, [nowSql(), jobId]);
    job = (await selectJob(connection, jobId))!;

    const [existingRows] = await connection.execute<any[]>('SELECT id,phone_normalized,email FROM directory_contacts');
    const byPhone = new Map<string, string>();
    const byEmail = new Map<string, string>();
    const existingIds = new Set<string>();
    for (const existing of existingRows) {
      existingIds.add(String(existing.id));
      if (existing.phone_normalized) byPhone.set(String(existing.phone_normalized), String(existing.id));
      if (existing.email) byEmail.set(normalizeEmail(existing.email), String(existing.id));
    }
    const completedRows = Number(job.processed_rows || 0);
    const remaining = parsed.rows.filter(row => row.rowNumber - 1 > completedRows);
    const validationErrors = new Map(parsed.errors.map(error => [error.rowNumber, error]));
    for (let offset = 0; offset < remaining.length; offset += job.batch_size) {
      job = (await selectJob(connection, jobId))!;
      if (job.cancel_requested === 1) {
        await connection.execute(`UPDATE directory_import_jobs SET status='cancelling',updated_at=? WHERE id=?`, [nowSql(), jobId]);
        const rolledBack = job.cancel_mode === 'rollback' ? await rollbackCreatedContacts(connection, jobId) : 0;
        await connection.execute(`UPDATE directory_import_jobs SET status='cancelled',rollback_status=?,rolled_back_rows=?,finished_at=?,updated_at=? WHERE id=?`, [job.cancel_mode === 'rollback' ? 'completed' : null, rolledBack, nowSql(), nowSql(), jobId]);
        return;
      }
      const batch = remaining.slice(offset, offset + job.batch_size);
      const newRows: Array<ImportRow & { contactId: string }> = [];
      const updated: Array<{ row: ImportRow; contactId: string }> = [];
      const rowRecords: Array<{ rowNumber: number; fingerprint: string; contactId: string | null; status: string; errorCode?: string; errorMessage?: string }> = [];
      let duplicateCount = 0;
      let skippedCount = 0;
      for (const row of batch) {
        const validationError = validationErrors.get(row.rowNumber);
        if (validationError) {
          rowRecords.push({ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId: null, status: 'failed', errorCode: validationError.code, errorMessage: validationError.message });
          continue;
        }
        const duplicateId = byPhone.get(row.phoneNormalized) || (row.email ? byEmail.get(row.email) : undefined);
        if (duplicateId && job.duplicate_strategy !== 'create') {
          duplicateCount++;
          if (job.duplicate_strategy === 'skip') {
            skippedCount++;
            rowRecords.push({ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId: duplicateId, status: 'duplicate' });
          } else {
            updated.push({ row, contactId: duplicateId });
            rowRecords.push({ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId: duplicateId, status: 'updated' });
          }
          continue;
        }
        const batchIds = new Set(newRows.map(item => item.contactId));
        const contactId = await createUniqueDirectoryContactId(id => existingIds.has(id) || batchIds.has(id));
        newRows.push({ ...row, contactId });
        existingIds.add(contactId);
        rowRecords.push({ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId, status: 'inserted' });
        if (row.phoneNormalized) byPhone.set(row.phoneNormalized, contactId);
        if (row.email) byEmail.set(row.email, contactId);
      }
      await connection.beginTransaction();
      try {
        await bulkInsertContacts(connection, job, newRows);
        for (const item of updated) await updateExistingContact(connection, item.contactId, item.row);
        await insertJobRows(connection, job.id, rowRecords);
        const failedCount = rowRecords.filter(row => row.status === 'failed').length;
        const processed = Math.min(job.total_rows, batch[batch.length - 1]?.rowNumber - 1 || job.processed_rows);
        await connection.execute(
          `UPDATE directory_import_jobs SET processed_rows=?,current_row=?,inserted_rows=inserted_rows+?,updated_rows=updated_rows+?,
           skipped_rows=skipped_rows+?,duplicate_rows=duplicate_rows+?,failed_rows=failed_rows+?,updated_at=? WHERE id=?`,
          [processed, batch[batch.length - 1]?.rowNumber || processed + 1, newRows.length, updated.length, skippedCount, duplicateCount, failedCount, nowSql(), job.id]
        );
        await connection.commit();
      } catch (error: any) {
        await connection.rollback();
        if (job.atomicity_mode === 'rollback_on_error') {
          await markJobFailed(connection, job, error, batch[0]?.rowNumber);
          return;
        }
        for (const row of batch) {
          try {
            await connection.beginTransaction();
            const contactId = await createUniqueDirectoryContactId(async id => {
              const [found] = await connection!.execute<any[]>('SELECT id FROM directory_contacts WHERE id=? LIMIT 1', [id]);
              return found.length > 0;
            });
            await bulkInsertContacts(connection, job, [{ ...row, contactId }]);
            await insertJobRows(connection, job.id, [{ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId, status: 'inserted' }]);
            await connection.execute(`UPDATE directory_import_jobs SET processed_rows=?,current_row=?,inserted_rows=inserted_rows+1,updated_at=? WHERE id=?`, [row.rowNumber - 1, row.rowNumber, nowSql(), job.id]);
            await connection.commit();
          } catch (rowError: any) {
            await connection.rollback();
            await insertJobRows(connection, job.id, [{ rowNumber: row.rowNumber, fingerprint: row.fingerprint, contactId: null, status: 'failed', errorCode: safeText(rowError.code || 'ROW_FAILED', 64), errorMessage: safeText(rowError.message, 500) }]);
            await connection.execute(`UPDATE directory_import_jobs SET processed_rows=?,current_row=?,failed_rows=failed_rows+1,updated_at=? WHERE id=?`, [row.rowNumber - 1, row.rowNumber, nowSql(), job.id]);
          }
        }
      }
    }
    job = (await selectJob(connection, jobId))!;
    const finalStatus = job.failed_rows > 0 ? 'completed_with_errors' : 'completed';
    await connection.execute(`UPDATE directory_import_jobs SET status=?,processed_rows=total_rows,current_row=total_rows+1,finished_at=?,updated_at=? WHERE id=?`, [finalStatus, nowSql(), nowSql(), jobId]);
    await writePBXPulsSystemEvent({
      event_type: 'directory_import_job_completed',
      severity: job.failed_rows > 0 ? 'warning' : 'info',
      source: 'pbxpuls_directory_import',
      message: 'Directory import job completed',
      details: { jobId, status: finalStatus, totalRows: job.total_rows }
    });
  } catch (error: any) {
    if (connection) {
      const job = await selectJob(connection, jobId).catch(() => null);
      if (job) await markJobFailed(connection, job, error, Number(error?.rowNumber || 0)).catch(() => {});
    }
  } finally {
    if (connection) await connection.end();
    runningJobs.delete(jobId);
  }
};

export function registerDirectoryImportJobRoutes(app: Express, deps: RegisterDependencies): void {
  const rawCsv = express.raw({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: MAX_IMPORT_BYTES });

  app.post('/api/directory/import-jobs', deps.requireAuth, rawCsv, async (req, res) => {
    if (!(await isAllowed(req, deps, 'import_directory'))) return res.status(403).json({ error: 'Нет прав на массовый импорт' });
    try {
      const content = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
      if (!content.length) return res.status(400).json({ error: 'CSV-файл пуст' });
      const sourceHash = sha256(content);
      let decodedFilename = req.header('x-import-filename') || 'directory-import.csv';
      try { decodedFilename = decodeURIComponent(decodedFilename); } catch (_error) {}
      const sourceFilename = safeText(decodedFilename, 255).replace(/[^\p{L}\p{N}_. -]/gu, '_');
      const atomicityMode: AtomicityMode = req.header('x-import-atomicity') === 'partial' ? 'partial' : 'rollback_on_error';
      const duplicateStrategy: DuplicateStrategy = ['skip', 'update', 'create'].includes(String(req.header('x-import-duplicate-strategy')))
        ? req.header('x-import-duplicate-strategy') as DuplicateStrategy
        : 'skip';
      if (atomicityMode === 'rollback_on_error' && duplicateStrategy === 'update') return res.status(400).json({ error: 'В атомарном режиме обновление существующих контактов запрещено; выберите пропуск дублей.' });
      const batchSize = Math.max(100, Math.min(1000, Number(req.header('x-import-batch-size') || 500)));
      const parsed = parseImportRows(content.toString('utf8'));
      const totalRows = parsed.rows.length + parsed.errors.length;
      const idempotencyKey = safeText(req.header('idempotency-key') || `${actorLabel(req)}:${sourceHash}:${atomicityMode}:${duplicateStrategy}`, 191);
      const connection = await getConnection();
      try {
        const [existing] = await connection.execute<any[]>('SELECT * FROM directory_import_jobs WHERE idempotency_key=? LIMIT 1', [idempotencyKey]);
        if (existing[0]) return res.json({ created: false, idempotent: true, job: safeJob(existing[0]) });
        fs.mkdirSync(DIRECTORY_IMPORT_ROOT, { recursive: true, mode: 0o750 });
        const jobId = `dij_${crypto.randomUUID()}`;
        const sourcePath = path.join(DIRECTORY_IMPORT_ROOT, `${jobId}.csv`);
        const temporaryPath = `${sourcePath}.tmp`;
        fs.writeFileSync(temporaryPath, content, { mode: 0o600 });
        fs.renameSync(temporaryPath, sourcePath);
        await connection.execute(
          `INSERT INTO directory_import_jobs(id,source_filename,source_hash,source_path,total_rows,status,cancel_requested,started_by,updated_at,mode,duplicate_strategy,batch_size,atomicity_mode,idempotency_key)
           VALUES(?,?,?,?,?,'queued',0,?,?,'upsert',?,?,?,?)`,
          [jobId, sourceFilename, sourceHash, sourcePath, totalRows, actorLabel(req), nowSql(), duplicateStrategy, batchSize, atomicityMode, idempotencyKey]
        );
        const job = await selectJob(connection, jobId);
        setImmediate(() => void processJob(jobId));
        res.status(202).json({ created: true, idempotent: false, job: safeJob(job!) });
      } finally {
        await connection.end();
      }
    } catch (error: any) {
      res.status(400).json({ error: safeImportErrorMessage(error) });
    }
  });

  app.get('/api/directory/import-jobs/:id', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'import_directory'))) return res.status(403).json({ error: 'Нет прав на просмотр импорта' });
    const connection = await getConnection();
    try {
      const job = await selectJob(connection, safeText(req.params.id, 64));
      if (!job) return res.status(404).json({ error: 'Import job не найден' });
      res.json({ job: safeJob(job) });
    } finally { await connection.end(); }
  });

  app.get('/api/directory/import-jobs/:id/progress', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'import_directory'))) return res.status(403).json({ error: 'Нет прав на просмотр прогресса' });
    const connection = await getConnection();
    try {
      const job = await selectJob(connection, safeText(req.params.id, 64));
      if (!job) return res.status(404).json({ error: 'Import job не найден' });
      res.setHeader('Cache-Control', 'no-store');
      res.json({ job: safeJob(job) });
    } finally { await connection.end(); }
  });

  app.post('/api/directory/import-jobs/:id/cancel', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'cancel_directory_import'))) return res.status(403).json({ error: 'Нет прав на остановку импорта' });
    const cancelMode: CancelMode = req.body?.mode === 'rollback' ? 'rollback' : 'preserve';
    const connection = await getConnection();
    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE directory_import_jobs SET cancel_requested=1,cancel_mode=?,status=IF(status='importing','cancelling',status),updated_at=? WHERE id=? AND status IN('queued','validating','importing','cancelling')`,
        [cancelMode, nowSql(), safeText(req.params.id, 64)]
      );
      if (!result.affectedRows) return res.status(409).json({ error: 'Job уже завершён или не найден' });
      res.json({ success: true, cancelRequested: true, cancelMode });
    } finally { await connection.end(); }
  });

  app.post('/api/directory/import-jobs/:id/resume', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'resume_directory_import'))) return res.status(403).json({ error: 'Нет прав на продолжение импорта' });
    const jobId = safeText(req.params.id, 64);
    const connection = await getConnection();
    try {
      const job = await selectJob(connection, jobId);
      if (!job || !['failed', 'cancelled'].includes(job.status)) return res.status(409).json({ error: 'Job нельзя продолжить' });
      const reset = job.rollback_status === 'completed';
      await connection.beginTransaction();
      if (reset) await connection.execute('DELETE FROM directory_import_job_rows WHERE job_id=?', [jobId]);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE directory_import_jobs SET status='queued',cancel_requested=0,cancel_mode=NULL,finished_at=NULL,error_code=NULL,error_row=NULL,error_message=NULL,
         processed_rows=IF(?,0,processed_rows),inserted_rows=IF(?,0,inserted_rows),updated_rows=IF(?,0,updated_rows),
         skipped_rows=IF(?,0,skipped_rows),duplicate_rows=IF(?,0,duplicate_rows),failed_rows=IF(?,0,failed_rows),
         current_row=IF(?,0,current_row),rollback_status=IF(?,NULL,rollback_status),rolled_back_rows=IF(?,0,rolled_back_rows),updated_at=?
         WHERE id=? AND status IN('failed','cancelled')`,
        [reset,reset,reset,reset,reset,reset,reset,reset,reset,nowSql(),jobId]
      );
      await connection.commit();
      if (!result.affectedRows) return res.status(409).json({ error: 'Job нельзя продолжить' });
      setImmediate(() => void processJob(jobId));
      res.status(202).json({ success: true, jobId, status: 'queued' });
    } catch (error) {
      await connection.rollback().catch(() => {});
      throw error;
    } finally { await connection.end(); }
  });

  app.post('/api/directory/import-jobs/:id/rollback-preview', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'rollback_directory_import'))) return res.status(403).json({ error: 'Нет прав на rollback preview' });
    const connection = await getConnection();
    try {
      const jobId = safeText(req.params.id, 64);
      const job = await selectJob(connection, jobId);
      if (!job) return res.status(404).json({ error: 'Import job не найден' });
      const [counts] = await connection.execute<any[]>(
        `SELECT COUNT(*) contacts,MIN(created_at) min_created_at,MAX(created_at) max_created_at FROM directory_contacts WHERE import_job_id=?`,
        [jobId]
      );
      const [metadata] = await connection.execute<any[]>(
        `SELECT COUNT(*) metadata FROM directory_contact_metadata WHERE contact_id IN(SELECT id FROM directory_contacts WHERE import_job_id=?)`,
        [jobId]
      );
      const [sample] = await connection.execute<any[]>(
        `SELECT id,name,company,phone,email,created_at FROM directory_contacts WHERE import_job_id=? ORDER BY import_row_number LIMIT 20`,
        [jobId]
      );
      res.json({
        previewId: `dirrb_${sha256(`${jobId}:${counts[0]?.contacts || 0}:${counts[0]?.max_created_at || ''}`).slice(0, 24)}`,
        jobId,
        contactsToDelete: Number(counts[0]?.contacts || 0),
        metadataToDelete: Number(metadata[0]?.metadata || 0),
        minCreatedAt: counts[0]?.min_created_at || null,
        maxCreatedAt: counts[0]?.max_created_at || null,
        sample,
        rollbackSafe: true,
        existingContactsAffected: 0,
        liveChanges: false
      });
    } finally { await connection.end(); }
  });

  app.post('/api/directory/import-jobs/:id/rollback', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'rollback_directory_import'))) return res.status(403).json({ error: 'Нет прав на rollback' });
    if (safeText(req.body?.confirmation, 100) !== 'ОТКАТИТЬ ИМПОРТ') return res.status(400).json({ error: 'Введите ОТКАТИТЬ ИМПОРТ' });
    const connection = await getConnection();
    try {
      const jobId = safeText(req.params.id, 64);
      const job = await selectJob(connection, jobId);
      if (!job) return res.status(404).json({ error: 'Import job не найден' });
      if (job.rollback_status === 'completed') return res.json({ success: true, idempotent: true, deleted: Number(job.rolled_back_rows || 0) });
      const deleted = await rollbackCreatedContacts(connection, jobId);
      res.json({ success: true, idempotent: false, deleted });
    } finally { await connection.end(); }
  });

  app.get('/api/directory/import-jobs/:id/errors', deps.requireAuth, async (req, res) => {
    if (!(await isAllowed(req, deps, 'view_directory_import_errors'))) return res.status(403).json({ error: 'Нет прав на просмотр ошибок импорта' });
    const connection = await getConnection();
    try {
      const [rows] = await connection.execute<any[]>(
        `SELECT row_number,error_code,error_message,updated_at FROM directory_import_job_rows WHERE job_id=? AND status='failed' ORDER BY row_number LIMIT 10000`,
        [safeText(req.params.id, 64)]
      );
      res.json({ errors: rows.map(row => ({ rowNumber: row.row_number, errorCode: row.error_code, message: row.error_message, at: row.updated_at })) });
    } finally { await connection.end(); }
  });
}
