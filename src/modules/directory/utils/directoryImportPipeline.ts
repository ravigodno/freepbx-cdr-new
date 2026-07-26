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
