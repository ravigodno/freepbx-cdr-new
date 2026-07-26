import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyDirectoryOwnershipPreview,
  getDirectoryImportActiveStep,
  getDirectoryImportDisabledReason
} from '../src/modules/directory/utils/directoryImportPipeline.js';

const unknownResponsibleUserIds = Array.from({ length: 48 }, (_, index) => ({ id: `u${index + 3}`, count: 2000 }));
const applied = applyDirectoryOwnershipPreview({
  totalContacts: 100000,
  sharedContacts: 100000,
  privateContacts: 0,
  withResponsible: 100000,
  withoutResponsible: 0,
  unknownResponsibleRows: 96000,
  invalidRows: 0,
  existingResponsibleUserIds: [{ id: 'u1', count: 2000 }, { id: 'u2', count: 2000 }],
  unknownResponsibleUserIds
}, 'clear');

assert.deepEqual({
  shared: applied.sharedContacts,
  private: applied.privateContacts,
  withResponsible: applied.withResponsible,
  withoutResponsible: applied.withoutResponsible,
  unknown: applied.unknownResponsibleRows,
  errors: applied.invalidRows,
  ready: applied.readyRows,
  clearedUnknown: applied.clearedUnknownRows,
  clearedExisting: applied.clearedExistingRows
}, {
  shared: 100000,
  private: 0,
  withResponsible: 0,
  withoutResponsible: 100000,
  unknown: 0,
  errors: 0,
  ready: 100000,
  clearedUnknown: 96000,
  clearedExisting: 4000
});

const base = {
  sourceReady: true,
  validationReady: true,
  ownershipReady: false,
  conflictPolicyReady: false,
  confirmationReady: false,
  importStepReady: false
};
assert.equal(getDirectoryImportActiveStep(base), 'ownership');
assert.match(getDirectoryImportDisabledReason(base, 0, false), /стратегию ответственных/);
assert.equal(getDirectoryImportActiveStep({ ...base, ownershipReady: true }), 'conflicts');
assert.equal(getDirectoryImportActiveStep({ ...base, ownershipReady: true, conflictPolicyReady: true }), 'confirmation');
assert.match(getDirectoryImportDisabledReason({ ...base, ownershipReady: true, conflictPolicyReady: true }, 0, false), /Подтвердите параметры/);
assert.equal(getDirectoryImportActiveStep({
  ...base,
  ownershipReady: true,
  conflictPolicyReady: true,
  confirmationReady: true,
  importStepReady: true
}), 'import');

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const pipelineSource = fs.readFileSync(new URL('../src/modules/directory/utils/directoryImportPipeline.ts', import.meta.url), 'utf8');
for (const marker of [
  'Этапы импорта',
  'Проверка данных',
  'Владение и видимость',
  'Поведение при конфликтах',
  'Подтверждение параметров импорта',
  'Я проверил параметры импорта',
  'Начать импорт',
  'Пересчёт владения, видимости и готовых строк',
  'Настройки применены',
  'Будут ',
  'rollback выполняется по',
  'Рекомендуется для корпоративного справочника'
]) assert.ok((app + pipelineSource).includes(marker), `missing pipeline marker: ${marker}`);

const recalculation = app.match(/const recalculateDirectoryOwnership[\s\S]*?const handlePreviewImport/)?.[0] || '';
assert.match(recalculation, /previewDirectoryImportOwnership/);
assert.doesNotMatch(recalculation, /prepareDirectoryImportSource|calculateDirectoryImportDigest|previewDirectoryImport\(/);
assert.match(app, /onChange=\{event=>\{const strategy=[\s\S]*recalculateDirectoryOwnership\(strategy,directoryResponsibleMappings\)/);
assert.doesNotMatch(app.match(/const recalculateDirectoryOwnership[\s\S]*?finally/)?.[0] || '', /handleExecuteImport|createDirectoryImportJob/);

console.log('directory import explicit pipeline tests: OK');
