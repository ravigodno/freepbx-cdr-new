import { parseDirectoryCsv } from '../../../../shared/directoryImportValidation.js';

export const DIRECTORY_IMPORT_MAX_BYTES = 100 * 1024 * 1024;

export type DirectoryImportSourceKind = 'file' | 'text';
export type DirectoryImportDigestStatus = 'idle' | 'calculating' | 'ready' | 'error';
export interface DirectoryImportDigestCapability {
  secureContext: boolean;
  browserCrypto: boolean;
  browserSubtle: boolean;
  digestProvider: 'web_crypto' | 'backend_stream';
  errorCode: 'INSECURE_CONTEXT' | 'SUBTLE_UNAVAILABLE' | null;
}

export interface DirectoryImportSourceSummary {
  kind: DirectoryImportSourceKind;
  name: string;
  bytes: number;
  characters: number;
  rows: number;
  delimiter: string;
  encoding: 'UTF-8';
}

const importHeaders = new Set([
  'name', 'fullname', 'имя', 'фио', 'company', 'organization', 'компания',
  'phone', 'phone1', 'телефон', 'номер', 'type', 'visibility'
]);

export function isSupportedDirectoryImportFile(name: string): boolean {
  return /\.(csv|txt|xlsx|xls)$/i.test(String(name || '').trim());
}

export async function convertDirectoryExcelToCsv(source: Blob): Promise<string> {
  const XLSX = await import('xlsx');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(await source.arrayBuffer(), { type: 'array', sheets: 0 });
  } catch {
    throw new Error('Не удалось прочитать Excel. Проверьте файл и снимите пароль, если он установлен.');
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.['!ref']) throw new Error('Первый лист Excel пуст.');
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if ((range.e.r + 1) * (range.e.c + 1) > 5_000_000) throw new Error('Слишком большой лист Excel. Разделите его на несколько файлов.');
  // Preserve formatted leading zeros, but avoid scientific notation for phone numbers and IDs.
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell.t === 'n' && typeof cell.v === 'number') {
      const formatted = XLSX.utils.format_cell(cell);
      if (/e[+-]\d+$/i.test(formatted)) cell.w = String(cell.v);
    }
  }
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) throw new Error('Первый лист Excel пуст.');
  if (new Blob([csv]).size > DIRECTORY_IMPORT_MAX_BYTES) throw new Error('Данные Excel превышают лимит 100 МБ.');
  return csv;
}

export function getDirectoryImportDigestCapability(scope: Pick<typeof globalThis, 'crypto'> & { isSecureContext?: boolean } = globalThis): DirectoryImportDigestCapability {
  const secureContext = scope.isSecureContext === true;
  const browserCrypto = !!scope.crypto;
  const browserSubtle = !!scope.crypto?.subtle;
  return {
    secureContext,
    browserCrypto,
    browserSubtle,
    digestProvider: browserSubtle ? 'web_crypto' : 'backend_stream',
    errorCode: browserSubtle ? null : (!secureContext ? 'INSECURE_CONTEXT' : 'SUBTLE_UNAVAILABLE')
  };
}

export function summarizeDirectoryImportSource(
  text: string,
  kind: DirectoryImportSourceKind,
  name: string,
  bytes = new Blob([text]).size
): DirectoryImportSourceSummary {
  const parsed = parseDirectoryCsv(text);
  const header = (parsed.rows[0]?.values || []).map(value => value.replace(/^\uFEFF/, '').trim().toLowerCase());
  const hasHeader = header.some(value => importHeaders.has(value));
  return {
    kind,
    name,
    bytes,
    characters: text.length,
    rows: Math.max(0, parsed.rows.length - (hasHeader ? 1 : 0)),
    delimiter: parsed.delimiter === '\t' ? 'TAB' : parsed.delimiter,
    encoding: 'UTF-8'
  };
}

export async function calculateDirectoryImportDigest(
  source: Blob,
  subtle: Pick<SubtleCrypto, 'digest'> | undefined = globalThis.crypto?.subtle
): Promise<string> {
  if (!subtle) throw new Error('DIGEST_UNAVAILABLE');
  const bytes = await source.arrayBuffer();
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}
