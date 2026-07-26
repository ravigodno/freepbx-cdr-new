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
const csvHelp = fs.readFileSync(new URL('../src/modules/directory/components/DirectoryCsvColumnsHelp.tsx', import.meta.url), 'utf8');
for (const marker of [
  'Источник данных',
  'Перетащите CSV или TXT сюда',
  'Вставьте CSV из буфера обмена',
  'Вставить из буфера',
  'Проверить данные',
  'directoryImportFileInputRef.current?.click()',
  "reader.readAsText(file, 'UTF-8')",
  "event.dataTransfer.files?.[0]",
  'Браузер не разрешил чтение буфера. Вставьте данные сочетанием Ctrl+V.',
  "directoryImportSourceKind==='file'",
  'sm:min-h-[220px]',
  'focus-visible:ring-2',
  'aria-live="polite"'
]) assert.ok(app.includes(marker), `missing embedded import UI marker: ${marker}`);

for (const marker of [
  'role="tablist" aria-label="Импорт и управление справочником"',
  'Личные контакты и синхронизация',
  'Корпоративный CSV',
  'Импорт по ссылке',
  'Управление справочником',
  "directoryPageMode === 'directory_admin'",
  "window.history.pushState({}, '', '/management/directory/import')",
  "window.history.pushState({}, '', '/directory/import-contacts')",
  "window.history.pushState({}, '', '/management/directory/import-url')",
  "window.history.pushState({}, '', '/management/directory/admin')",
  'handleSaveDirectoryUrlSettings',
  'saveDirectoryUrlSettings',
  'Настройки сохранены. Выполняется синхронизация справочника…',
  'Синхронизация по ссылке включена',
  'Синхронизация выполняется',
  'role="progressbar"',
  'Это история предыдущего запуска, а не ошибка текущей страницы.',
  'Автоматический вызов выполняется внешним cron',
  'CSV/JSON, расписание и ручная синхронизация',
  "hasPermission('manage_directory_import')",
  "hasPermission('directory_import_contacts')"
]) assert.ok(app.includes(marker), `missing unified import marker: ${marker}`);
assert.equal((app.match(/<h2 className="flex items-center gap-2 break-words text-lg font-black text-slate-900">[\s\S]*?Импорт контактов[\s\S]*?<\/h2>/g) || []).length, 1);
assert.equal((app.match(/Импорт справочника по ссылке/g) || []).length, 1);
assert.equal((app.match(/Панель администратора справочника/g) || []).length, 0);
assert.ok(app.includes('Сервисные операции вынесены из списка контактов.'));
for (const marker of ['Описание CSV-столбцов', 'responsibleUserId', 'linkedExternalNumber', 'visibility=shared', 'Пример CSV', 'Скачать пример CSV', 'pbxpuls_directory_import_example.csv', '\\uFEFF']) {
  assert.ok(csvHelp.includes(marker), `missing CSV columns help marker: ${marker}`);
}
assert.match(app, /const handleSyncDirectoryUrl = async \(\) =>[\s\S]*await saveDirectoryUrlSettings\(\)[\s\S]*fetch\('\/api\/directory\/sync-url'/);

assert.doesNotMatch(app, /isImportOpen|setIsImportOpen|aria-label="Загрузка CSV-файла"|Загрузка откроется в отдельном окне/);
assert.equal((app.match(/createDirectoryImportJob\(/g) || []).length, 1);
assert.match(app, /const handleExecuteImport = async \(\) =>[\s\S]*createDirectoryImportJob\(/);
assert.doesNotMatch(app.match(/const handleDirectoryImportFile[\s\S]*?const handleFileUpload/)?.[0] || '', /createDirectoryImportJob|handleExecuteImport/);
assert.match(app, /prepareDirectoryImportSource\(session\.token, source/);
assert.match(app, /createDirectoryImportJob\(session\.token, preparedSource\.sourceId/);
assert.match(app, /previewDirectoryImportOwnership\(session\.token, preparedSource\.sourceId/);
assert.doesNotMatch(app, /createDirectoryImportJob\(session\.token, source,/);

console.log('directory import source and embedded UI tests: OK');
