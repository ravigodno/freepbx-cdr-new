import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AccessRole } from '../types';
import { PermissionKey } from '../permissions';

interface PermissionsMatrixTabProps {
  roles: AccessRole[];
  isLoadingRoles: boolean;
  isSavingRoles: boolean;
  onRolesChange: (roles: AccessRole[]) => void;
  onSaveRoles: () => void;
}

const PERMISSION_ROWS: Array<{ key: PermissionKey; label: string }> = [
  { key: 'view_calls', label: 'Звонки' },
  { key: 'process_calls', label: 'Обработка' },
  { key: 'view_directory', label: 'Справочник' },
  { key: 'edit_directory', label: 'Ред. справочник' },
  { key: 'manage_directory_import', label: 'Импорт справ.' },
  { key: 'manage_blacklist', label: 'Черный список' },
  { key: 'view_reports', label: 'Отчеты' },
  { key: 'export_excel', label: 'Excel' },
  { key: 'listen_recordings', label: 'Записи' },
  { key: 'delete_records', label: 'Удаление' },
  { key: 'make_calls', label: 'Click2Call' },
  { key: 'view_monitoring', label: 'Мониторинг' },
  { key: 'view_active_calls', label: 'Активные' },
  { key: 'view_tcpdump', label: 'Tcpdump' },
  { key: 'view_sngrep', label: 'Sngrep' },
  { key: 'view_cli', label: 'CLI' },
  { key: 'view_settings', label: 'Настройки' },
  { key: 'manage_users', label: 'Пользователи' },
  { key: 'manage_roles', label: 'Роли' },
  { key: 'view_management', label: 'Управление' },
  { key: 'dangerous_pbx_write', label: 'Опасные изменения АТС' },
  { key: 'bulk_extensions', label: 'Массовые EXT' },
  { key: 'manage_trunks', label: 'Транки' },
  { key: 'manage_outbound_routes', label: 'Исходящие правила' },
  { key: 'manage_numbering_capacity', label: 'Номерная емкость' },
  { key: 'view_balance', label: 'Баланс' },
  { key: 'manage_balance_providers', label: 'Провайдеры баланса' }
];

export default function PermissionsMatrixTab({
  roles,
  isLoadingRoles,
  isSavingRoles,
  onRolesChange,
  onSaveRoles
}: PermissionsMatrixTabProps) {
  const [newRoleName, setNewRoleName] = useState('');

  const updateRolePermission = (roleId: string, key: PermissionKey, checked: boolean) => {
    onRolesChange(
      roles.map(role =>
        role.id === roleId
          ? {
              ...role,
              permissions: {
                ...(role.permissions || {}),
                [key]: checked
              }
            }
          : role
      )
    );
  };

  const updateRoleName = (roleId: string, name: string) => {
    onRolesChange(
      roles.map(role =>
        role.id === roleId && !role.system
          ? { ...role, name }
          : role
      )
    );
  };

  const addRole = () => {
    const cleanName = newRoleName.trim();
    if (!cleanName) return;

    const idBase = cleanName
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '');

    let id = `role_${idBase || Date.now()}`;
    if (roles.some(role => role.id === id)) {
      id = `${id}_${Date.now()}`;
    }

    onRolesChange([
      ...roles,
      {
        id,
        name: cleanName,
        system: false,
        permissions: {}
      }
    ]);

    setNewRoleName('');
  };

  const deleteRole = (roleId: string) => {
    const role = roles.find(item => item.id === roleId);
    if (!role || role.system) return;
    if (!window.confirm(`Удалить роль "${role.name}"?`)) return;

    onRolesChange(roles.filter(item => item.id !== roleId));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-black text-slate-900">
            Матрица доступа
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Управление ролями и правами пользователей.
          </p>
        </div>

      </div>

      <div className="p-4 border-b border-slate-100 bg-white flex flex-col gap-2 lg:flex-row">
        <input
          type="text"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          placeholder="Название новой роли"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={addRole}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
          Добавить роль
        </button>
      </div>

      {isLoadingRoles ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Загрузка ролей...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1800px] text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 text-left">Роль</th>
                {PERMISSION_ROWS.map(permission => (
                  <th key={permission.key} className="p-3 text-center">
                    {permission.label}
                  </th>
                ))}
                <th className="p-3 text-center">Удалить</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {roles.map(role => (
                <tr key={role.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    {role.system ? (
                      <div>
                        <div className="font-black text-slate-800">{role.name}</div>
                        <div className="text-[11px] text-slate-400">системная роль</div>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={role.name}
                        onChange={(e) => updateRoleName(role.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                      />
                    )}
                  </td>

                  {PERMISSION_ROWS.map(permission => (
                    <td key={permission.key} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={role.permissions?.[permission.key] === true}
                        onChange={(e) => updateRolePermission(role.id, permission.key, e.target.checked)}
                        className="rounded border-slate-300 text-red-600"
                      />
                    </td>
                  ))}

                  <td className="p-3 text-center">
                    {!role.system && (
                      <button
                        type="button"
                        onClick={() => deleteRole(role.id)}
                        className="inline-flex items-center justify-center rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {roles.length === 0 && (
                <tr>
                  <td colSpan={PERMISSION_ROWS.length + 2} className="p-8 text-center text-sm text-slate-500">
                    Роли пока не загружены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
