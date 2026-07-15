import { AccessUser, UserFormState } from '../types';

export async function fetchAccessUsers(token: string): Promise<AccessUser[]> {
  const resp = await fetch('/api/users', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const error: any = new Error('Не удалось загрузить пользователей.');
    error.response = resp;
    throw error;
  }

  return resp.json();
}

export async function saveAccessUserApi(
  token: string,
  userForm: UserFormState,
  editingUserId: string | null
): Promise<void> {
  const url = editingUserId ? `/api/users/${editingUserId}` : '/api/users';
  const method = editingUserId ? 'PUT' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(userForm)
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось сохранить пользователя.');
  }
}

export async function deleteAccessUserApi(
  token: string,
  userId: string
): Promise<void> {
  const resp = await fetch(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось удалить пользователя.');
  }
}

export async function previewBulkAccessUsers(token: string, rows: Array<Record<string, unknown>>) {
  const resp = await fetch('/api/users/bulk-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Не удалось проверить пользователей.');
  return data;
}

export async function createBulkAccessUsers(token: string, rows: Array<Record<string, unknown>>) {
  const resp = await fetch('/api/users/bulk-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rows, confirm: true })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || 'Не удалось создать пользователей.');
  return data;
}
