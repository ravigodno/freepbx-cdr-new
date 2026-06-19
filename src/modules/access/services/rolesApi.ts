import { AccessRole } from '../types';

export async function fetchAccessRoles(token: string): Promise<AccessRole[]> {
  const resp = await fetch('/api/roles', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || 'Не удалось загрузить роли.');
  }

  return resp.json();
}

export async function saveAccessRoles(
  token: string,
  roles: AccessRole[]
): Promise<AccessRole[]> {
  const resp = await fetch('/api/roles', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ roles })
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось сохранить роли.');
  }

  return data.roles || roles;
}
