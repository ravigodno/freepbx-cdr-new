export async function fetchDirectory(token: string) {
  const resp = await fetch('/api/directory', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (resp.status === 401) {
    throw new Error('UNAUTHORIZED');
  }

  if (!resp.ok) {
    throw new Error('Не удалось загрузить справочник');
  }

  return resp.json();
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
    throw new Error('UNAUTHORIZED');
  }

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось изменить черный список.');
  }

  return data;
}
