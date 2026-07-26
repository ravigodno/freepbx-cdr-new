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
  sortBy?: 'name' | 'organization' | 'createdAt' | 'phone';
  sortDirection?: 'asc' | 'desc';
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

export async function fetchDirectory(token: string, filters: DirectoryFetchFilters = {}, signal?: AbortSignal): Promise<DirectoryPageResponse & { queryTimeMs?: number }> {
  const legacyUrl = buildDirectoryUrl(filters);
  const resp = await fetch(legacyUrl.replace(/^\/api\/directory/, '/api/directory/contacts'), {
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal
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

export interface DirectoryImportPreparedSource {
  sourceId: string;
  originalFilename: string;
  size: number;
  sourceHash: string;
  rowCount: number;
  delimiter: string;
  encoding: 'UTF-8';
  status: 'ready';
  expiresAt: string;
  digestProvider: 'node_stream_sha256';
}

export function prepareDirectoryImportSource(token: string, source: Blob, options: {
  filename: string;
  diagnostics: {
    digestProvider: string;
    secureContext: boolean;
    browserCrypto: boolean;
    browserSubtle: boolean;
    errorCode: string | null;
  };
  onProgress?: (loaded: number, total: number) => void;
  onUploaded?: () => void;
}): Promise<{ source: DirectoryImportPreparedSource; reused: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/directory/import-sources');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Import-Filename', encodeURIComponent(options.filename));
    xhr.setRequestHeader('X-Import-Source-Size', String(source.size));
    xhr.setRequestHeader('X-Import-Digest-Provider', options.diagnostics.digestProvider);
    xhr.setRequestHeader('X-Import-Secure-Context', String(options.diagnostics.secureContext));
    xhr.setRequestHeader('X-Import-Browser-Crypto', String(options.diagnostics.browserCrypto));
    xhr.setRequestHeader('X-Import-Browser-Subtle', String(options.diagnostics.browserSubtle));
    if (options.diagnostics.errorCode) xhr.setRequestHeader('X-Import-Digest-Error-Code', options.diagnostics.errorCode);
    xhr.upload.onprogress = event => options.onProgress?.(event.loaded, event.lengthComputable ? event.total : source.size);
    xhr.upload.onload = () => options.onUploaded?.();
    xhr.onerror = () => reject(new Error('Загрузка источника была прервана.'));
    xhr.onabort = () => reject(new Error('Загрузка источника была прервана.'));
    xhr.onload = () => {
      const data = (() => { try { return JSON.parse(xhr.responseText || '{}'); } catch (_error) { return {}; } })();
      if (xhr.status === 401) {
        handleAuthExpiredResponse(new Response(null, { status: 401 }));
        reject(new Error('UNAUTHORIZED'));
      } else if (xhr.status < 200 || xhr.status >= 300) {
        reject(Object.assign(new Error(data.error || 'Сервер не смог сохранить временный источник.'), { code: data.errorCode }));
      } else {
        resolve(data);
      }
    };
    xhr.send(source);
  });
}

export async function deleteDirectoryImportSource(token: string, sourceId: string) {
  const resp = await fetch(`/api/directory/import-sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось очистить временный источник.');
}

export async function createDirectoryImportJob(token: string, sourceId: string, options: {
  atomicityMode: 'rollback_on_error' | 'partial';
  duplicateStrategy: 'skip' | 'update' | 'create';
  batchSize?: number;
  idempotencyKey: string;
  unknownResponsibleStrategy: 'clear' | 'skip' | 'map';
  responsibleUserMappings?: Record<string, string>;
}) {
  const resp = await fetch('/api/directory/import-jobs', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sourceId, ...options })
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось создать задачу импорта.');
}

export async function previewDirectoryImportOwnership(token: string, sourceId: string, options: {
  unknownResponsibleStrategy: 'clear' | 'skip' | 'map';
  responsibleUserMappings?: Record<string, string>;
}) {
  const resp = await fetch('/api/directory/import-jobs/preview', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sourceId, ...options })
  });
  return parseDirectorySettingsResponse(resp, 'Не удалось проверить владельцев контактов.');
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
