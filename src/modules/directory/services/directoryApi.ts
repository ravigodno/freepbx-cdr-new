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
    throw new Error(data.error || 'Не удалось выполнить предпросмотр импорта.');
  }

  return data;
}
