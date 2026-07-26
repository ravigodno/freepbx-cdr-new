export type DirectoryImportPipelineStep = 'source' | 'validation' | 'ownership' | 'conflicts' | 'confirmation' | 'import';

export interface DirectoryImportPipelineState {
  sourceReady: boolean;
  validationReady: boolean;
  ownershipReady: boolean;
  conflictPolicyReady: boolean;
  confirmationReady: boolean;
  importStepReady: boolean;
}

export interface DirectoryOwnershipPreviewLike {
  totalContacts?: number;
  sharedContacts?: number;
  privateContacts?: number;
  withResponsible?: number;
  withoutResponsible?: number;
  unknownResponsibleRows?: number;
  invalidRows?: number;
  existingResponsibleUserIds?: Array<{ id: string; count: number }>;
  unknownResponsibleUserIds?: Array<{ id: string; count: number }>;
}

export interface DirectoryOwnershipAppliedSummary {
  totalContacts: number;
  sharedContacts: number;
  privateContacts: number;
  withResponsible: number;
  withoutResponsible: number;
  unknownResponsibleRows: number;
  invalidRows: number;
  readyRows: number;
  skippedRows: number;
  clearedUnknownRows: number;
  clearedExistingRows: number;
  unknownResponsibleUserIds: Array<{ id: string; count: number }>;
}

export interface DirectoryImportEffectiveRow {
  entry: any;
  index: number;
  preview: any;
  diagnostics: any[];
  hasErrors: boolean;
  duplicate: boolean;
  skipped: boolean;
  transformationWarnings: string[];
}

export const directoryImportPipelineSteps: Array<{ id: DirectoryImportPipelineStep; label: string }> = [
  { id: 'source', label: 'Источник' },
  { id: 'validation', label: 'Проверка данных' },
  { id: 'ownership', label: 'Владение и видимость' },
  { id: 'conflicts', label: 'Поведение при конфликтах' },
  { id: 'confirmation', label: 'Подтверждение' },
  { id: 'import', label: 'Импорт' }
];

export function getDirectoryImportActiveStep(state: DirectoryImportPipelineState): DirectoryImportPipelineStep {
  if (!state.sourceReady) return 'source';
  if (!state.validationReady) return 'validation';
  if (!state.ownershipReady) return 'ownership';
  if (!state.conflictPolicyReady) return 'conflicts';
  if (!state.confirmationReady || !state.importStepReady) return 'confirmation';
  return 'import';
}

export function applyDirectoryOwnershipPreview(
  preview: DirectoryOwnershipPreviewLike,
  strategy: 'clear' | 'skip' | 'map'
): DirectoryOwnershipAppliedSummary {
  const totalContacts = Number(preview.totalContacts || 0);
  const invalidRows = Number(preview.invalidRows || 0);
  const unknownRows = Number(preview.unknownResponsibleRows || 0);
  const existingRows = (preview.existingResponsibleUserIds || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (strategy === 'clear') {
    return {
      totalContacts,
      sharedContacts: totalContacts - invalidRows,
      privateContacts: 0,
      withResponsible: 0,
      withoutResponsible: totalContacts - invalidRows,
      unknownResponsibleRows: 0,
      invalidRows,
      readyRows: Math.max(0, totalContacts - invalidRows),
      skippedRows: 0,
      clearedUnknownRows: unknownRows,
      clearedExistingRows: existingRows,
      unknownResponsibleUserIds: preview.unknownResponsibleUserIds || []
    };
  }
  const unresolvedRows = strategy === 'map' ? unknownRows : 0;
  const skippedRows = strategy === 'skip' ? unknownRows : 0;
  return {
    totalContacts,
    sharedContacts: Number(preview.sharedContacts || 0),
    privateContacts: Number(preview.privateContacts || 0),
    withResponsible: Number(preview.withResponsible || 0) - skippedRows,
    withoutResponsible: Number(preview.withoutResponsible || 0),
    unknownResponsibleRows: unresolvedRows,
    invalidRows: invalidRows + unresolvedRows,
    readyRows: Math.max(0, totalContacts - invalidRows - unresolvedRows - skippedRows),
    skippedRows,
    clearedUnknownRows: 0,
    clearedExistingRows: 0,
    unknownResponsibleUserIds: preview.unknownResponsibleUserIds || []
  };
}

export function getDirectoryImportDisabledReason(
  state: DirectoryImportPipelineState,
  errorRows: number,
  recalculating: boolean
): string {
  if (!state.sourceReady) return 'Сначала выберите и подготовьте источник.';
  if (!state.validationReady) return 'Сначала проверьте данные.';
  if (recalculating) return 'Идёт пересчёт данных.';
  if (!state.ownershipReady) return 'Сначала выберите и примените стратегию ответственных.';
  if (errorRows > 0) return `Исправьте ошибки: ${errorRows.toLocaleString('ru-RU')}.`;
  if (!state.conflictPolicyReady) return 'Подтвердите поведение при конфликтах.';
  if (!state.confirmationReady) return 'Подтвердите параметры импорта.';
  if (!state.importStepReady) return 'Перейдите к финальному шагу импорта.';
  return '';
}

const responsibleError = (value: unknown): boolean => /^responsibleUserId\s*:/i.test(String(value || '').trim());

export function normalizeDirectoryEntriesForOwnership(
  entries: any[],
  preview: DirectoryOwnershipPreviewLike | null,
  strategy: 'clear' | 'skip' | 'map',
  mappings: Record<string, string>
): any[] {
  const unknownIds = new Set((preview?.unknownResponsibleUserIds || []).map(item => String(item.id)));
  return entries.map(entry => {
    const responsibleUserId = String(entry?.responsibleUserId || '');
    if (strategy === 'clear') {
      return { ...entry, visibility: 'shared', responsibleUserId: null };
    }
    if (strategy === 'map' && mappings[responsibleUserId]) {
      return { ...entry, responsibleUserId: mappings[responsibleUserId] };
    }
    if (strategy === 'skip' && unknownIds.has(responsibleUserId)) {
      // Validate the remaining row fields without retaining a stale ownership error.
      return { ...entry, visibility: 'shared', responsibleUserId: null };
    }
    return entry;
  });
}

export function buildDirectoryEffectiveRows(
  entries: any[],
  previewRows: any[],
  ownershipPreview: DirectoryOwnershipPreviewLike | null,
  strategy: 'clear' | 'skip' | 'map',
  mappings: Record<string, string>
): DirectoryImportEffectiveRow[] {
  const previewByIndex = new Map(previewRows.map(row => [Number(row.index), row]));
  const unknownIds = new Set((ownershipPreview?.unknownResponsibleUserIds || []).map(item => String(item.id)));
  const normalizedEntries = normalizeDirectoryEntriesForOwnership(entries, ownershipPreview, strategy, mappings);
  return normalizedEntries.map((entry, index) => {
    const originalEntry = entries[index] || {};
    const originalResponsible = String(originalEntry.responsibleUserId || '');
    const skipped = strategy === 'skip' && unknownIds.has(originalResponsible);
    const mapped = strategy === 'map' && !!mappings[originalResponsible];
    const ownershipResolved = strategy === 'clear' || skipped || mapped;
    const sourcePreview = previewByIndex.get(index) || {};
    const previewErrors = (sourcePreview.errors || []).filter((message: string) => !(ownershipResolved && responsibleError(message)));
    const entryErrors = (originalEntry._importErrors || []).filter((message: string) => !(ownershipResolved && responsibleError(message)));
    const preview = { ...sourcePreview, entry, errors: previewErrors };
    const transformationWarnings = strategy === 'clear' && originalResponsible
      ? [`Ответственный ${originalResponsible} будет очищен`]
      : skipped
        ? [`Строка будет исключена: ответственный ${originalResponsible} не найден`]
        : mapped
          ? [`Ответственный ${originalResponsible} будет сопоставлен с ${mappings[originalResponsible]}`]
          : [];
    return {
      entry: { ...entry, _importErrors: entryErrors },
      index,
      preview,
      diagnostics: [
        ...(originalEntry._importDiagnostics || []),
        ...previewErrors.map((message: string) => ({ field: 'row', reason: message }))
      ],
      hasErrors: entryErrors.length > 0 || previewErrors.length > 0,
      duplicate: !skipped && !!sourcePreview.duplicateId,
      skipped,
      transformationWarnings
    };
  });
}
