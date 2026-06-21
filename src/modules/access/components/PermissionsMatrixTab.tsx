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
  isSu?: boolean;
  showSuPermissionsToAdmin?: boolean;
  allowAdminEditSuPermissions?: boolean;
}

type PermissionKind = 'tab' | 'feature' | 'su';

interface PermissionRow {
  key: PermissionKey;
  label: string;
  kind: PermissionKind;
  hint: string;
}

const PERMISSION_ROWS: PermissionRow[] = [
  { key: 'view_calls', label: 'Звонки', kind: 'tab', hint: 'Открывает вкладку звонков' },
  { key: 'view_directory', label: 'Справочник', kind: 'tab', hint: 'Открывает вкладку справочника' },
  { key: 'view_reports', label: 'Отчеты', kind: 'tab', hint: 'Открывает вкладку отчетов' },
  { key: 'view_monitoring', label: 'Мониторинг', kind: 'tab', hint: 'Открывает раздел мониторинга' },
  { key: 'view_active_calls', label: 'Активные', kind: 'tab', hint: 'Открывает активные звонки' },
  { key: 'view_tcpdump', label: 'Tcpdump', kind: 'tab', hint: 'Открывает TCPDUMP' },
  { key: 'view_sngrep', label: 'Sngrep', kind: 'tab', hint: 'Открывает SNGREP' },
  { key: 'view_cli', label: 'CLI/DB', kind: 'tab', hint: 'Открывает CLI, FreePBX CLI и DB Explorer' },
  { key: 'view_settings', label: 'Настройки', kind: 'tab', hint: 'Открывает настройки' },
  { key: 'view_management', label: 'Управление', kind: 'tab', hint: 'Открывает управленческий раздел' },
  { key: 'view_balance', label: 'Баланс', kind: 'tab', hint: 'Открывает баланс' },

  { key: 'process_calls', label: 'Обработка', kind: 'feature', hint: 'Обработка звонков внутри журнала' },
  { key: 'edit_directory', label: 'Ред. справочник', kind: 'feature', hint: 'Создание, изменение и удаление записей справочника' },
  { key: 'manage_directory_import', label: 'Импорт справ.', kind: 'feature', hint: 'Импорт, экспорт, нормализация и синхронизация справочника' },
  { key: 'manage_blacklist', label: 'Черный список', kind: 'feature', hint: 'Управление черным списком' },
  { key: 'export_excel', label: 'Excel', kind: 'feature', hint: 'Экспорт отчетов и таблиц' },
  { key: 'listen_recordings', label: 'Записи', kind: 'feature', hint: 'Прослушивание записей звонков' },
  { key: 'delete_records', label: 'Удаление', kind: 'feature', hint: 'Удаление записей' },
  { key: 'make_calls', label: 'Click2Call', kind: 'feature', hint: 'Совершение звонков из интерфейса' },

  { key: 'manage_users', label: 'Пользователи', kind: 'su', hint: 'Служебное право управления пользователями' },
  { key: 'manage_roles', label: 'Роли', kind: 'su', hint: 'Служебное право управления ролями' },
  { key: 'dangerous_pbx_write', label: 'Опасные изменения АТС', kind: 'su', hint: 'Опасные изменения FreePBX/Asterisk' },
  { key: 'bulk_extensions', label: 'Массовые EXT', kind: 'su', hint: 'Массовые операции с внутренними номерами' },
  { key: 'manage_trunks', label: 'Транки', kind: 'su', hint: 'Управление транками' },
  { key: 'manage_outbound_routes', label: 'Исходящие правила', kind: 'su', hint: 'Управление исходящими маршрутами' },
  { key: 'manage_numbering_capacity', label: 'Номерная емкость', kind: 'su', hint: 'Управление номерной емкостью' },
  { key: 'manage_balance_providers', label: 'Провайдеры баланса', kind: 'su', hint: 'Управление провайдерами баланса' }
];

const getPermissionBadgeClass = (kind: PermissionKind) => {
  if (kind === 'tab') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (kind === 'feature') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-red-50 text-red-700 border-red-200';
};

const getPermissionKindLabel = (kind: PermissionKind) => {
  if (kind === 'tab') return 'Вкладка';
  if (kind === 'feature') return 'Функция';
  return 'SU';
};

export default function PermissionsMatrixTab({
  roles,
  isLoadingRoles,
  isSavingRoles,
  onRolesChange,
  onSaveRoles,
  isSu = false,
  showSuPermissionsToAdmin = false,
  allowAdminEditSuPermissions = false
}: PermissionsMatrixTabProps) {
  const [newRoleName, setNewRoleName] = useState('');

  const visiblePermissionRows = isSu || showSuPermissionsToAdmin
    ? PERMISSION_ROWS
    : PERMISSION_ROWS.filter(permission => permission.kind !== 'su');

  const canEditPermission = (permission: PermissionRow) => {
    if (permission.kind !== 'su') return true;
    return isSu || allowAdminEditSuPermissions;
  };

  const updateRolePermission = (roleId: string, key: PermissionKey, checked: boolean) => {
    const permission = PERMISSION_ROWS.find(item => item.key === key);
    if (permission && !canEditPermission(permission)) return;

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
          <h4 className="text-sm font-black text-slate-900">Матрица доступа</h4>
          <p className="text-xs text-slate-500 mt-1">
            Синие права открывают вкладки, зеленые включают функции внутри вкладок, красные являются служебными.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] font-black">
          <span className="rounded-full border px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">Вкладка</span>
          <span className="rounded-full border px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200">Функция</span>
          {(isSu || showSuPermissionsToAdmin) && (
            <span className="rounded-full border px-2 py-1 bg-red-50 text-red-700 border-red-200">SU</span>
          )}
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
        <div className="p-8 text-center text-sm text-slate-500">Загрузка ролей...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1800px] text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 text-left">Роль</th>
                {visiblePermissionRows.map(permission => (
                  <th key={permission.key} className="p-3 text-center align-top">
                    <div className="flex flex-col items-center gap-1" title={permission.hint}>
                      <span>{permission.label}</span>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black normal-case tracking-normal ${getPermissionBadgeClass(permission.kind)}`}>
                        {getPermissionKindLabel(permission.kind)}
                      </span>
                    </div>
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

                  {visiblePermissionRows.map(permission => {
                    const editable = canEditPermission(permission);
                    return (
                      <td key={permission.key} className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={role.permissions?.[permission.key] === true}
                          disabled={!editable}
                          title={!editable ? 'Изменять это служебное право может только SU' : permission.hint}
                          onChange={(e) => updateRolePermission(role.id, permission.key, e.target.checked)}
                          className={
                            permission.kind === 'tab'
                              ? 'rounded border-blue-300 text-blue-600'
                              : permission.kind === 'feature'
                                ? 'rounded border-emerald-300 text-emerald-600'
                                : editable
                                  ? 'rounded border-red-300 text-red-600'
                                  : 'rounded border-red-200 text-red-300 opacity-40 cursor-not-allowed'
                          }
                        />
                      </td>
                    );
                  })}

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
                  <td colSpan={visiblePermissionRows.length + 2} className="p-8 text-center text-sm text-slate-500">
                    Роли пока не загружены.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isSavingRoles && (
        <div className="p-3 border-t border-slate-100 text-xs text-slate-500 bg-slate-50">
          Сохранение матрицы доступа...
        </div>
      )}
    </div>
  );
}
