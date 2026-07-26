import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import {
  calculateDirectoryImportDigest,
  getDirectoryImportDigestCapability,
  DIRECTORY_IMPORT_MAX_BYTES,
  isSupportedDirectoryImportFile,
  summarizeDirectoryImportSource
} from '../src/modules/directory/utils/directoryImportSource.js';

if (!globalThis.Blob) (globalThis as any).Blob = NodeBlob;

assert.equal(isSupportedDirectoryImportFile('contacts.csv'), true);
assert.equal(isSupportedDirectoryImportFile('contacts.TXT'), true);
assert.equal(isSupportedDirectoryImportFile('contacts.xlsx'), false);
assert.equal(DIRECTORY_IMPORT_MAX_BYTES, 100 * 1024 * 1024);

const csv = 'type,visibility,fullName,phone\nclient,shared,Иван,+79781234567\n';
const csvSummary = summarizeDirectoryImportSource(csv, 'file', 'contacts.csv');
assert.equal(csvSummary.rows, 1);
assert.equal(csvSummary.delimiter, ',');
assert.equal(csvSummary.encoding, 'UTF-8');

const excel = 'type\tvisibility\tfullName\tphone\nclient\tshared\tИван\t100\n';
const excelSummary = summarizeDirectoryImportSource(excel, 'text', 'Вставленные данные');
assert.equal(excelSummary.rows, 1);
assert.equal(excelSummary.delimiter, 'TAB');

const digest = await calculateDirectoryImportDigest(
  new Blob(['abc']),
  webcrypto.subtle as unknown as SubtleCrypto
);
assert.equal(digest, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
await assert.rejects(() => calculateDirectoryImportDigest(new Blob(['abc']), null as any), /DIGEST_UNAVAILABLE/);
assert.deepEqual(getDirectoryImportDigestCapability({ crypto: webcrypto as Crypto, isSecureContext: true }), {
  secureContext: true,
  browserCrypto: true,
  browserSubtle: true,
  digestProvider: 'web_crypto',
  errorCode: null
});
assert.deepEqual(getDirectoryImportDigestCapability({ crypto: {} as Crypto, isSecureContext: false }), {
  secureContext: false,
  browserCrypto: true,
  browserSubtle: false,
  digestProvider: 'backend_stream',
  errorCode: 'INSECURE_CONTEXT'
});

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
for (const marker of [
  'Источник данных',
  'Перетащите CSV или TXT сюда',
  'Вставьте CSV из буфера обмена',
  'Вставить из буфера',
  'Открыть предпросмотр',
  'directoryImportFileInputRef.current?.click()',
  "reader.readAsText(file, 'UTF-8')",
  "event.dataTransfer.files?.[0]",
  'Браузер не разрешил чтение буфера. Вставьте данные сочетанием Ctrl+V.',
  "directoryImportSourceKind==='file'",
  'sm:min-h-[220px]',
  'focus-visible:ring-2',
  'aria-live="polite"'
]) assert.ok(app.includes(marker), `missing embedded import UI marker: ${marker}`);

assert.doesNotMatch(app, /isImportOpen|setIsImportOpen|aria-label="Загрузка CSV-файла"|Загрузка откроется в отдельном окне/);
assert.equal((app.match(/createDirectoryImportJob\(/g) || []).length, 1);
assert.match(app, /const handleExecuteImport = async \(\) =>[\s\S]*createDirectoryImportJob\(/);
assert.doesNotMatch(app.match(/const handleDirectoryImportFile[\s\S]*?const handleFileUpload/)?.[0] || '', /createDirectoryImportJob|handleExecuteImport/);
assert.match(app, /prepareDirectoryImportSource\(session\.token, source/);
assert.match(app, /createDirectoryImportJob\(session\.token, preparedSource\.sourceId/);
assert.match(app, /previewDirectoryImportOwnership\(session\.token, preparedSource\.sourceId/);
assert.doesNotMatch(app, /createDirectoryImportJob\(session\.token, source,/);

console.log('directory import source and embedded UI tests: OK');
