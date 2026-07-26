import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Express, Request, RequestHandler } from 'express';
import { parseDirectoryCsv } from '../shared/directoryImportValidation.js';
import { writePBXPulsSystemEvent } from './pbxpulsEvents.js';

export const DIRECTORY_IMPORT_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
export const DIRECTORY_IMPORT_SOURCE_TTL_MS = 6 * 60 * 60 * 1000;
export const DIRECTORY_IMPORT_SOURCE_ROOT = process.env.PBXPULS_DIRECTORY_SOURCE_ROOT || '/var/lib/pbxpuls/directory-import-sources';

export type DirectoryImportSourceStatus = 'uploading' | 'hashing' | 'ready' | 'failed';

export interface DirectoryImportSourceRecord {
  id: string;
  original_filename: string;
  stored_filename: string;
  size_bytes: number;
  sha256: string;
  row_count: number;
  delimiter: string;
  encoding: 'UTF-8';
  status: DirectoryImportSourceStatus;
  created_by: string;
  created_at: string;
  expires_at: string;
  error_code: string | null;
  digest_provider: 'node_stream_sha256';
  client_diagnostics: {
    digestProvider: string;
    secureContext: boolean | null;
    browserCrypto: boolean | null;
    browserSubtle: boolean | null;
    fileSize: number;
    errorCode: string | null;
  };
}

type SourceRouteDependencies = {
  requireAuth: RequestHandler;
  hasPermission: (req: Request, permission: string) => Promise<boolean>;
};

type PrepareSourceOptions = {
  root?: string;
  actor: string;
  originalFilename: string;
  expectedBytes?: number | null;
  now?: Date;
  diagnostics?: Partial<DirectoryImportSourceRecord['client_diagnostics']>;
  source?: Readable;
};

const safeText = (value: unknown, maxLength = 255): string => String(value ?? '').trim().slice(0, maxLength);
const iso = (value = new Date()): string => value.toISOString();
const metadataPath = (root: string, id: string): string => path.join(root, `${id}.json`);
const sourcePath = (root: string, storedFilename: string): string => path.join(root, storedFilename);
const allowedId = (value: unknown): string => {
  const id = safeText(value, 80);
  if (!/^dis_[a-f0-9-]{36}$/.test(id)) throw Object.assign(new Error('INVALID_SOURCE_ID'), { code: 'INVALID_SOURCE_ID' });
  return id;
};

const validateFilename = (value: unknown): string => {
  const original = safeText(value, 255);
  if (!original || path.basename(original) !== original || /[\\/]/.test(original)) {
    throw Object.assign(new Error('INVALID_FILENAME'), { code: 'INVALID_FILENAME' });
  }
  if (!/\.(csv|txt)$/i.test(original)) {
    throw Object.assign(new Error('UNSUPPORTED_FILE_TYPE'), { code: 'UNSUPPORTED_FILE_TYPE' });
  }
  return original.replace(/[^\p{L}\p{N}_. -]/gu, '_');
};

const writeRecord = (root: string, record: DirectoryImportSourceRecord): void => {
  fs.writeFileSync(metadataPath(root, record.id), JSON.stringify(record), { mode: 0o600 });
};

const readRecord = (root: string, id: string): DirectoryImportSourceRecord | null => {
  try {
    return JSON.parse(fs.readFileSync(metadataPath(root, allowedId(id)), 'utf8'));
  } catch (_error) {
    return null;
  }
};

const safeRecord = (record: DirectoryImportSourceRecord) => ({
  sourceId: record.id,
  originalFilename: record.original_filename,
  size: record.size_bytes,
  sourceHash: record.sha256,
  rowCount: record.row_count,
  delimiter: record.delimiter === '\t' ? 'TAB' : record.delimiter,
  encoding: record.encoding,
  status: record.status,
  createdAt: record.created_at,
  expiresAt: record.expires_at,
  errorCode: record.error_code,
  digestProvider: record.digest_provider,
  diagnostics: record.client_diagnostics
});

class CsvRowTracker {
  private inQuotes = false;
  private quotePending = false;
  private rowHasContent = false;
  private logicalRows = 0;
  private sample: number[] = [];

  push(chunk: Buffer): void {
    if (this.sample.length < 64 * 1024) {
      this.sample.push(...chunk.subarray(0, 64 * 1024 - this.sample.length));
    }
    for (const byte of chunk) {
      if (byte === 0x22) {
        this.rowHasContent = true;
        if (!this.inQuotes) {
          this.inQuotes = true;
          this.quotePending = false;
        } else if (this.quotePending) {
          this.quotePending = false;
        } else {
          this.quotePending = true;
        }
        continue;
      }
      if (this.quotePending) {
        this.inQuotes = false;
        this.quotePending = false;
      }
      if (!this.inQuotes && byte === 0x0a) {
        if (this.rowHasContent) this.logicalRows++;
        this.rowHasContent = false;
        continue;
      }
      if (byte !== 0x0d && byte !== 0x20 && byte !== 0x09) this.rowHasContent = true;
    }
  }

  finish(): { rows: number; delimiter: string } {
    if (this.rowHasContent) this.logicalRows++;
    const sampleText = Buffer.from(this.sample).toString('utf8');
    const parsed = parseDirectoryCsv(sampleText);
    const header = (parsed.rows[0]?.values || []).map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase());
    const knownHeaders = new Set(['name', 'fullname', 'имя', 'фио', 'company', 'organization', 'компания', 'phone', 'phone1', 'телефон', 'номер', 'type', 'visibility']);
    const hasHeader = header.some(value => knownHeaders.has(value));
    return { rows: Math.max(0, this.logicalRows - (hasHeader ? 1 : 0)), delimiter: parsed.delimiter };
  }
}

export async function cleanupExpiredDirectoryImportSources(root = DIRECTORY_IMPORT_SOURCE_ROOT, now = new Date()): Promise<number> {
  if (!fs.existsSync(root)) return 0;
  let deleted = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/^dis_[a-f0-9-]{36}\.json$/.test(name)) continue;
    try {
      const record: DirectoryImportSourceRecord = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (Date.parse(record.expires_at) > now.getTime()) continue;
      fs.rmSync(sourcePath(root, record.stored_filename), { force: true });
      fs.rmSync(path.join(root, name), { force: true });
      deleted++;
    } catch (_error) {}
  }
  return deleted;
}

const findReusableSource = (root: string, sha256: string, actor: string, now: Date): DirectoryImportSourceRecord | null => {
  for (const name of fs.readdirSync(root)) {
    if (!/^dis_[a-f0-9-]{36}\.json$/.test(name)) continue;
    try {
      const record: DirectoryImportSourceRecord = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
      if (record.status === 'ready' && record.sha256 === sha256 && record.created_by === actor && Date.parse(record.expires_at) > now.getTime()) {
        return record;
      }
    } catch (_error) {}
  }
  return null;
};

export async function prepareDirectoryImportSource(options: PrepareSourceOptions): Promise<{ record: DirectoryImportSourceRecord; reused: boolean }> {
  const root = path.resolve(options.root || DIRECTORY_IMPORT_SOURCE_ROOT);
  const now = options.now || new Date();
  const filename = validateFilename(options.originalFilename);
  const expectedBytes = Number(options.expectedBytes ?? 0);
  if (expectedBytes > DIRECTORY_IMPORT_SOURCE_MAX_BYTES) throw Object.assign(new Error('SOURCE_TOO_LARGE'), { code: 'SOURCE_TOO_LARGE' });
  fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  await cleanupExpiredDirectoryImportSources(root, now);
  const id = `dis_${crypto.randomUUID()}`;
  const storedFilename = `${id}.csv`;
  const targetPath = sourcePath(root, storedFilename);
  if (path.dirname(targetPath) !== root) throw Object.assign(new Error('INVALID_SOURCE_PATH'), { code: 'INVALID_SOURCE_PATH' });
  const diagnostics = {
    digestProvider: safeText(options.diagnostics?.digestProvider || 'backend_stream', 40),
    secureContext: typeof options.diagnostics?.secureContext === 'boolean' ? options.diagnostics.secureContext : null,
    browserCrypto: typeof options.diagnostics?.browserCrypto === 'boolean' ? options.diagnostics.browserCrypto : null,
    browserSubtle: typeof options.diagnostics?.browserSubtle === 'boolean' ? options.diagnostics.browserSubtle : null,
    fileSize: expectedBytes,
    errorCode: safeText(options.diagnostics?.errorCode, 80) || null
  };
  const record: DirectoryImportSourceRecord = {
    id,
    original_filename: filename,
    stored_filename: storedFilename,
    size_bytes: 0,
    sha256: '',
    row_count: 0,
    delimiter: ',',
    encoding: 'UTF-8',
    status: 'uploading',
    created_by: safeText(options.actor, 100) || 'unknown',
    created_at: iso(now),
    expires_at: iso(new Date(now.getTime() + DIRECTORY_IMPORT_SOURCE_TTL_MS)),
    error_code: null,
    digest_provider: 'node_stream_sha256',
    client_diagnostics: diagnostics
  };
  writeRecord(root, record);
  const input = options.source;
  if (!input) throw Object.assign(new Error('SOURCE_STREAM_REQUIRED'), { code: 'SOURCE_STREAM_REQUIRED' });
  const output = fs.createWriteStream(targetPath, { flags: 'wx', mode: 0o600 });
  const hash = crypto.createHash('sha256');
  const tracker = new CsvRowTracker();
  let size = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        input.destroy();
        output.destroy();
        reject(error);
      };
      input.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > DIRECTORY_IMPORT_SOURCE_MAX_BYTES) {
          fail(Object.assign(new Error('SOURCE_TOO_LARGE'), { code: 'SOURCE_TOO_LARGE' }));
          return;
        }
        hash.update(buffer);
        tracker.push(buffer);
        if (!output.write(buffer)) input.pause();
      });
      output.on('drain', () => input.resume());
      input.once('aborted', () => fail(Object.assign(new Error('UPLOAD_INTERRUPTED'), { code: 'UPLOAD_INTERRUPTED' })));
      input.once('error', fail);
      output.once('error', fail);
      input.once('end', () => output.end());
      output.once('finish', resolve);
    });
    if (!size) throw Object.assign(new Error('SOURCE_EMPTY'), { code: 'SOURCE_EMPTY' });
    if (expectedBytes > 0 && expectedBytes !== size) throw Object.assign(new Error('SOURCE_SIZE_MISMATCH'), { code: 'SOURCE_SIZE_MISMATCH' });
    record.status = 'hashing';
    record.size_bytes = size;
    writeRecord(root, record);
    const digest = hash.digest('hex');
    const summary = tracker.finish();
    const reusable = findReusableSource(root, digest, record.created_by, now);
    if (reusable && reusable.id !== record.id) {
      fs.rmSync(targetPath, { force: true });
      fs.rmSync(metadataPath(root, record.id), { force: true });
      return { record: reusable, reused: true };
    }
    record.sha256 = digest;
    record.row_count = summary.rows;
    record.delimiter = summary.delimiter;
    record.status = 'ready';
    record.error_code = null;
    writeRecord(root, record);
    return { record, reused: false };
  } catch (error: any) {
    record.status = 'failed';
    record.size_bytes = size;
    record.error_code = safeText(error?.code || 'SOURCE_PREPARATION_FAILED', 80);
    writeRecord(root, record);
    fs.rmSync(targetPath, { force: true });
    throw error;
  }
}

export async function verifyDirectoryImportSource(record: DirectoryImportSourceRecord, root = DIRECTORY_IMPORT_SOURCE_ROOT): Promise<void> {
  if (record.status !== 'ready' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
    throw Object.assign(new Error('SOURCE_NOT_READY'), { code: 'SOURCE_NOT_READY' });
  }
  const filePath = sourcePath(path.resolve(root), record.stored_filename);
  const stat = fs.statSync(filePath);
  if (stat.size !== record.size_bytes) throw Object.assign(new Error('SOURCE_SIZE_MISMATCH'), { code: 'SOURCE_SIZE_MISMATCH' });
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', resolve);
  });
  if (hash.digest('hex') !== record.sha256) throw Object.assign(new Error('SOURCE_HASH_MISMATCH'), { code: 'SOURCE_HASH_MISMATCH' });
}

export function getReadyDirectoryImportSource(id: string, actor: string, privileged = false, root = DIRECTORY_IMPORT_SOURCE_ROOT): DirectoryImportSourceRecord {
  const record = readRecord(path.resolve(root), allowedId(id));
  if (!record || (!privileged && record.created_by !== actor)) throw Object.assign(new Error('SOURCE_NOT_FOUND'), { code: 'SOURCE_NOT_FOUND' });
  if (Date.parse(record.expires_at) <= Date.now()) throw Object.assign(new Error('SOURCE_EXPIRED'), { code: 'SOURCE_EXPIRED' });
  if (record.status !== 'ready') throw Object.assign(new Error('SOURCE_NOT_READY'), { code: 'SOURCE_NOT_READY' });
  return record;
}

export function directoryImportSourceFilePath(record: DirectoryImportSourceRecord, root = DIRECTORY_IMPORT_SOURCE_ROOT): string {
  const resolvedRoot = path.resolve(root);
  const resolved = sourcePath(resolvedRoot, record.stored_filename);
  if (path.dirname(resolved) !== resolvedRoot) throw Object.assign(new Error('INVALID_SOURCE_PATH'), { code: 'INVALID_SOURCE_PATH' });
  return resolved;
}

const actorLabel = (req: Request): string => safeText((req as any).user?.id || (req as any).user?.username || (req as any).user?.role || 'unknown', 100);
const privileged = (req: Request): boolean => ['su', 'admin'].includes(String((req as any).user?.role || ''));
const allowed = async (req: Request, deps: SourceRouteDependencies): Promise<boolean> => privileged(req) || deps.hasPermission(req, 'import_directory');
const headerBoolean = (value: unknown): boolean | null => value === 'true' ? true : value === 'false' ? false : null;

const safeSourceError = (error: any): { status: number; error: string; errorCode: string } => {
  const code = safeText(error?.code || error?.message || 'SOURCE_PREPARATION_FAILED', 80).toUpperCase();
  if (code === 'SOURCE_TOO_LARGE') return { status: 413, error: 'Файл превышает допустимый размер 100 МБ.', errorCode: code };
  if (code === 'UNSUPPORTED_FILE_TYPE') return { status: 415, error: 'Поддерживаются только CSV и TXT.', errorCode: code };
  if (code === 'INVALID_FILENAME' || code === 'INVALID_SOURCE_ID') return { status: 400, error: 'Некорректное имя источника.', errorCode: code };
  if (code === 'UPLOAD_INTERRUPTED' || code === 'SOURCE_SIZE_MISMATCH') return { status: 400, error: 'Загрузка источника была прервана.', errorCode: code };
  if (code === 'SOURCE_EMPTY') return { status: 400, error: 'Источник пуст.', errorCode: code };
  if (code === 'SOURCE_NOT_FOUND' || code === 'SOURCE_EXPIRED') return { status: 404, error: 'Временный источник не найден или истёк.', errorCode: code };
  if (code === 'SOURCE_NOT_READY') return { status: 409, error: 'Источник ещё не готов.', errorCode: code };
  return { status: 500, error: 'Сервер не смог сохранить временный источник.', errorCode: code };
};

export function registerDirectoryImportSourceRoutes(app: Express, deps: SourceRouteDependencies): void {
  const cleanupTimer = setInterval(() => {
    void cleanupExpiredDirectoryImportSources().catch(() => {});
  }, 30 * 60 * 1000);
  cleanupTimer.unref();

  app.post('/api/directory/import-sources', deps.requireAuth, async (req, res) => {
    if (!(await allowed(req, deps))) return res.status(403).json({ error: 'Нет прав на подготовку импорта' });
    try {
      const contentType = safeText(req.header('content-type'), 100).toLowerCase();
      if (!['application/octet-stream', 'text/csv', 'text/plain'].some(type => contentType.startsWith(type))) {
        return res.status(415).json({ error: 'Поддерживается потоковая загрузка CSV/TXT.', errorCode: 'UNSUPPORTED_CONTENT_TYPE' });
      }
      const expectedBytes = Number(req.header('content-length') || req.header('x-import-source-size') || 0);
      const result = await prepareDirectoryImportSource({
        actor: actorLabel(req),
        originalFilename: decodeURIComponent(req.header('x-import-filename') || 'pasted-directory-import.csv'),
        expectedBytes,
        source: req,
        diagnostics: {
          digestProvider: req.header('x-import-digest-provider') || 'backend_stream',
          secureContext: headerBoolean(req.header('x-import-secure-context')),
          browserCrypto: headerBoolean(req.header('x-import-browser-crypto')),
          browserSubtle: headerBoolean(req.header('x-import-browser-subtle')),
          errorCode: req.header('x-import-digest-error-code') || null
        }
      });
      await writePBXPulsSystemEvent({
        event_type: 'directory_import_source_ready',
        severity: 'info',
        source: 'pbxpuls_directory_import',
        message: 'Directory import source prepared',
        details: { sourceId: result.record.id, size: result.record.size_bytes, rows: result.record.row_count, reused: result.reused, actor: result.record.created_by }
      });
      res.status(result.reused ? 200 : 201).json({ source: safeRecord(result.record), reused: result.reused });
    } catch (error: any) {
      const safe = safeSourceError(error);
      res.status(safe.status).json({ error: safe.error, errorCode: safe.errorCode });
    }
  });

  app.get('/api/directory/import-sources/:id', deps.requireAuth, async (req, res) => {
    if (!(await allowed(req, deps))) return res.status(403).json({ error: 'Нет прав на просмотр источника' });
    try {
      await cleanupExpiredDirectoryImportSources();
      const record = getReadyDirectoryImportSource(req.params.id, actorLabel(req), privileged(req));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ source: safeRecord(record) });
    } catch (error: any) {
      const safe = safeSourceError(error);
      res.status(safe.status).json({ error: safe.error, errorCode: safe.errorCode });
    }
  });

  app.delete('/api/directory/import-sources/:id', deps.requireAuth, async (req, res) => {
    if (!(await allowed(req, deps))) return res.status(403).json({ error: 'Нет прав на удаление источника' });
    try {
      const root = path.resolve(DIRECTORY_IMPORT_SOURCE_ROOT);
      const record = getReadyDirectoryImportSource(req.params.id, actorLabel(req), privileged(req), root);
      fs.rmSync(directoryImportSourceFilePath(record, root), { force: true });
      fs.rmSync(metadataPath(root, record.id), { force: true });
      await writePBXPulsSystemEvent({
        event_type: 'directory_import_source_deleted',
        severity: 'info',
        source: 'pbxpuls_directory_import',
        message: 'Directory import source deleted',
        details: { sourceId: record.id, actor: actorLabel(req) }
      });
      res.json({ success: true, sourceId: record.id });
    } catch (error: any) {
      const safe = safeSourceError(error);
      res.status(safe.status).json({ error: safe.error, errorCode: safe.errorCode });
    }
  });
}
