import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { UserRole } from '../../../types';
import { AccessRole, AccessUser, UserFormState } from '../types';
import { PermissionKey } from '../permissions';



interface AccessUsersTabProps {
  accessUsers: AccessUser[];
  accessError: string;
  editingUserId: string | null;
  userForm: UserFormState;
  isSavingUser: boolean;
  setUserForm: React.Dispatch<React.SetStateAction<UserFormState>>;
  openEditUser: (user: AccessUser) => void;
  deleteAccessUser: (user: AccessUser) => void;
  saveAccessUser: () => void;
  resetUserForm: () => void;
  roles: AccessRole[];
}

export default function AccessUsersTab({
  accessUsers,
  accessError,
  editingUserId,
  userForm,
  isSavingUser,
  setUserForm,
  openEditUser,
  deleteAccessUser,
  saveAccessUser,
  resetUserForm,
  roles
}: AccessUsersTabProps) {
  const permissionRows: Array<{ key: PermissionKey; label: string; description: string }> = [
    { key: 'view_calls', label: 'Просмотр звонков', description: 'Доступ к журналу CDR и списку вызовов' },
    { key: 'view_directory', label: 'Просмотр справочника', description: 'Доступ к телефонному справочнику' },
    { key: 'view_reports', label: 'Просмотр отчетов', description: 'Доступ к отчетам и статистике' },
    { key: 'listen_recordings', label: 'Прослушивание записей', description: 'Доступ к аудиозаписям разговоров' },
    { key: 'make_calls', label: 'Click2Call', description: 'Возможность инициировать звонки' },
    { key: 'edit_directory', label: 'Редактирование справочника', description: 'Создание и изменение контактов' }
  ];

  const togglePermission = (key: PermissionKey, checked: boolean) => {
    setUserForm({
      ...userForm,
      permissions: {
        ...(userForm.permissions || {}),
        [key]: checked
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <h4 className="text-sm font-black text-slate-900">Пользователи</h4>
        </div>

        <div className="divide-y divide-slate-100">
          {accessUsers.map(user => (
            <div
              key={user.id}
              className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50"
            >
              <div className="min-w-0">
                <div className="font-black text-slate-900 text-sm truncate">
                  {user.username}
                </div>

                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                    {user.role}
                  </span>
                  <span>
                    SIP: <b>{user.extension || '—'}</b>
                  </span>
                  {user.disabled && (
                    <span className="text-red-600 font-bold">Отключён</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditUser(user)}
                  className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  <Edit2 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => deleteAccessUser(user)}
                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {accessUsers.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Пользователей пока нет.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <h4 className="text-sm font-black text-slate-900">
          {editingUserId ? 'Редактировать пользователя' : 'Новый пользователь'}
        </h4>

        {accessError && (
          <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {accessError}
          </div>
        )}

        <label className="text-xs font-bold text-slate-600 block">
          Логин
          <input
            type="text"
            value={userForm.username}
            onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
            className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs"
          />
        </label>

        <label className="text-xs font-bold text-slate-600 block">
          Пароль {editingUserId && <span className="text-slate-400 font-normal">(пусто — не менять)</span>}
          <input
            type="password"
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs"
          />
        </label>

        <label className="text-xs font-bold text-slate-600 block">
          Роль
          <select
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
            className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs"
          >
            {roles.map(role => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>

        {userForm.role === 'custom' && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div>
              <div className="text-xs font-black text-slate-800">
                Индивидуальные права
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Эти настройки применяются только к пользователю с ролью custom.
              </div>
            </div>

            <div className="space-y-2 pt-1">
              {permissionRows.map(permission => (
                <label
                  key={permission.key}
                  className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={userForm.permissions?.[permission.key] === true}
                    onChange={(e) => togglePermission(permission.key, e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-red-600"
                  />
                  <span>
                    <span className="block font-bold text-slate-700">
                      {permission.label}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {permission.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="text-xs font-bold text-slate-600 block">
          SIP номер
          <input
            type="text"
            value={userForm.extension}
            onChange={(e) => setUserForm({ ...userForm, extension: e.target.value.replace(/[^\d]/g, '') })}
            className="mt-1 w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-mono"
            placeholder="200"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-700 font-bold">
          <input
            type="checkbox"
            checked={userForm.disabled}
            onChange={(e) => setUserForm({ ...userForm, disabled: e.target.checked })}
            className="rounded border-slate-300 text-red-600"
          />
          Отключить пользователя
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => saveAccessUser()}
            disabled={isSavingUser}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
          >
            {isSavingUser ? 'Сохранение...' : 'Сохранить'}
          </button>

          <button
            type="button"
            onClick={resetUserForm}
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold"
          >
            Сброс
          </button>
        </div>
      </div>
    </div>
  );
}
