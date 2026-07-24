import { handleAuthExpiredResponse } from '../../../services/apiClient';

export interface DirectoryFetchFilters {
  q?: string;
  search?: string;
  type?: string;
  department?: string;
  company?: string;
  status?: string;
  responsible?: string;
  spamMode?: 'all' | 'exclude_spam' | 'only_spam';
  visibilityMode?: 'all' | 'shared_only' | 'private_only' | 'my_private_only' | 'exclude_private' | 'exclude_shared';
  page?: number;
  pageSize?: number;
  all?: boolean;
}

export interface DirectoryPageResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DirectoryColumnSettingsResponse {
  visibleColumns: string[];
  source: 'user' | 'global' | 'system';
  canManageGlobal: boolean;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

async function parseDirectorySettingsResponse(resp: Response, fallbackError: string) {
  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data;
}

function buildDirectoryUrl(filters: DirectoryFetchFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    params.set(key, String(value));
  });
  return params.toString() ? '/api/directory?' + params.toString() : '/api/directory';
}

export async function fetchDirectory(token: string, filters: DirectoryFetchFilters = {}): Promise<DirectoryPageResponse> {
  const resp = await fetch(buildDirectoryUrl(filters), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  if (!resp.ok) {
    throw new Error('Не удалось загрузить справочник');
  }

  return resp.json();
}

export async function fetchDirectoryAll(token: string, filters: DirectoryFetchFilters = {}) {
  const resp = await fetch(buildDirectoryUrl({ ...filters, all: true }), {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  if (!resp.ok) {
    throw new Error('Не удалось загрузить справочник');
  }

  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

export async function setDirectoryFavorite(token: string, contactId: string, favorite: boolean) {
  const resp = await fetch(`/api/directory/${encodeURIComponent(contactId)}/favorite`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ favorite })
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Не удалось изменить избранное');
  return data;
}

export async function saveDirectoryEntry(token: string, payload: any, id?: string) {
  const resp = await fetch(id ? `/api/directory/${id}` : '/api/directory', {
    method: id ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  return resp.json();
}

export async function deleteDirectoryEntry(token: string, id: string) {
  const resp = await fetch(`/api/directory/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  return resp.json();
}

export async function previewDirectoryBulkDelete(token: string, scope: 'filtered' | 'all', filters: DirectoryFetchFilters) {
  const resp = await fetch('/api/directory/bulk-delete/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scope, filters })
  });
  const data = await parseDirectorySettingsResponse(resp, 'Не удалось проверить массовое удаление.');
  return data;
}

export async function applyDirectoryBulkDelete(token: string, previewId: string, confirmation: string) {
  const resp = await fetch('/api/directory/bulk-delete/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ previewId, confirmation })
  });
  const data = await parseDirectorySettingsResponse(resp, 'Не удалось выполнить массовое удаление.');
  return data;
}

export async function createDirectoryImportJob(token: string, file: Blob, options: {
  filename: string;
  atomicityMode: 'rollback_on_error' | 'partial';
  duplicateStrategy: 'skip' | 'update' | 'create';
  batchSize?: number;
  idempotencyKey: string;
}) {
  const resp = await fetch('/api/directory/import-jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/csv',
      'X-Import-Filename': encodeURIComponent(options.filename),
      'X-Import-Atomicity': options.atomicityMode,
      'X-Import-Duplicate-Strategy': options.duplicateStrategy,
      'X-Import-Batch-Size': String(options.batchSize || 500),
      'Idempotency-Key': options.idempotencyKey
    },
    body: file
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось создать задачу импорта.');
}

export async function getDirectoryImportJob(token: string, jobId: string) {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/progress`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось получить прогресс импорта.');
}

export async function cancelDirectoryImportJob(token: string, jobId: string, mode: 'preserve' | 'rollback') {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode })
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось остановить импорт.');
}

export async function resumeDirectoryImportJob(token: string, jobId: string) {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось продолжить импорт.');
}

export async function previewDirectoryImportRollback(token: string, jobId: string) {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/rollback-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({})
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось подготовить rollback preview.');
}

export async function applyDirectoryImportRollback(token: string, jobId: string, confirmation: string) {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirmation })
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось откатить импорт.');
}

export async function getDirectoryImportJobErrors(token: string, jobId: string) {
  const resp = await fetch(`/api/directory/import-jobs/${encodeURIComponent(jobId)}/errors`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось получить ошибки импорта.');
}

export async function toggleDirectoryBlacklist(
  token: string,
  id: string,
  enabled: boolean,
  syncAsterisk = true
) {
  const resp = await fetch(`/api/directory/${id}/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ enabled, syncAsterisk })
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось изменить черный список.');
  }

  return data;
}

export async function toggleDirectorySpam(token: string, id: string, enabled: boolean) {
  const resp = await fetch(`/api/directory/${id}/spam`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ enabled })
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось изменить признак спама.');
  }

  return data;
}

export async function previewDirectoryImport(token: string, entries: any[]) {
  const resp = await fetch('/api/directory/import/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ entries })
  });

  if (resp.status === 401) {
    handleAuthExpiredResponse(resp);
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if (resp.status === 413) {
      throw new Error('Пакет предпросмотра превышает допустимый размер сервера.');
    }
    throw new Error(data.message || data.error || `Не удалось выполнить предпросмотр импорта (HTTP ${resp.status}).`);
  }

  return data;
}


export async function fetchDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось загрузить настройки столбцов');
}

export async function saveMyDirectoryColumnSettings(token: string, visibleColumns: string[]): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/me', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ visibleColumns })
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сохранить личные настройки столбцов');
}

export async function resetMyDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/me', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сбросить личные настройки столбцов');
}

export async function saveGlobalDirectoryColumnSettings(token: string, visibleColumns: string[]): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/global', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ visibleColumns })
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сохранить базовые настройки столбцов');
}

export async function resetGlobalDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/global', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сбросить базовые настройки столбцов');
}
