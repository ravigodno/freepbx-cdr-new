import type { DirectoryEntry } from '../../../types';
import type { DirectoryCustomFieldDefinition } from '../services/directoryApi';

type ExportCell = string | number | boolean;
type ExportTable = { headers: string[]; rows: ExportCell[][] };

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value);
const yesNo = (value: unknown): string => value === true || value === 1 ? 'Да' : 'Нет';

function contactPhones(entry: DirectoryEntry): string[] {
  return [...new Set([...(entry.phones || []), entry.number].map(value => text(value).trim()).filter(Boolean))];
}

function buildDirectoryExportTable(
  entries: DirectoryEntry[],
  customFields: DirectoryCustomFieldDefinition[]
): ExportTable {
  const maxPhones = Math.max(1, ...entries.map(entry => contactPhones(entry).length));
  const visibleCustomFields = [...customFields].sort((left, right) =>
    Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || left.fieldName.localeCompare(right.fieldName, 'ru')
  );
  const headers = [
    'ID', 'Тип', 'Видимость', 'ID владельца', 'ФИО', 'Организация', 'Должность',
    'Подразделение', 'Группа', ...Array.from({ length: maxPhones }, (_, index) => `Телефон ${index + 1}`),
    'Внутренний номер', 'Связанный внешний номер', 'Email', 'Сайт', 'ИНН', 'КПП', 'ОГРН',
    'Адрес', 'Комментарий', 'Теги', 'ID ответственного', 'Ответственный',
    'Спам', 'Чёрный список', 'Отключён', 'Скрыт', 'Избранное',
    'SIP-статус', 'Статус устройства', 'Тип устройства', 'Создан', 'Изменён',
    ...visibleCustomFields.map(field => field.fieldName)
  ];
  const rows = entries.map(entry => {
    const phones = contactPhones(entry);
    return [
      entry.id, entry.type, entry.visibility || 'shared', entry.ownerUserId || '', entry.name,
      entry.company || '', entry.position || '', entry.department || '', entry.group || '',
      ...Array.from({ length: maxPhones }, (_, index) => phones[index] || ''),
      entry.internalExtension || '', entry.linkedExternalNumber || '', entry.email || '', entry.website || '',
      entry.inn || '', entry.kpp || '', entry.ogrn || '', entry.address || '', entry.comment || '',
      (entry.tags || []).join('; '), entry.responsibleUserId || '', entry.responsibleUserLabel || '',
      yesNo(entry.isSpam), yesNo(entry.isBlacklisted), yesNo(entry.disabled), yesNo(entry.hidden),
      yesNo(entry.isFavorite), entry.sipStatus || '', entry.deviceStatus || '', entry.deviceType || '',
      entry.createdAt || '', entry.updatedAt || '',
      ...visibleCustomFields.map(field => text(entry.customFields?.[field.fieldKey]))
    ];
  });
  return { headers, rows };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadDirectoryCsv(
  entries: DirectoryEntry[],
  customFields: DirectoryCustomFieldDefinition[],
  filename: string
): void {
  const table = buildDirectoryExportTable(entries, customFields);
  const escape = (value: ExportCell) => `"${text(value).replace(/"/g, '""')}"`;
  const csv = [table.headers.map(escape), ...table.rows.map(row => row.map(escape))]
    .map(row => row.join(';'))
    .join('\r\n');
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), filename);
}

export async function downloadDirectoryExcel(
  entries: DirectoryEntry[],
  customFields: DirectoryCustomFieldDefinition[],
  filename: string
): Promise<void> {
  const XLSX = await import('xlsx');
  const table = buildDirectoryExportTable(entries, customFields);
  const worksheet = XLSX.utils.aoa_to_sheet([table.headers, ...table.rows]);
  worksheet['!autofilter'] = { ref: worksheet['!ref'] || 'A1:A1' };
  worksheet['!cols'] = table.headers.map((header, columnIndex) => ({
    wch: Math.min(48, Math.max(10, header.length + 2, ...table.rows.slice(0, 500).map(row => text(row[columnIndex]).length + 2)))
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Справочник');
  XLSX.writeFile(workbook, filename, { compression: true });
}
