import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, ShieldCheck, Crown, UserCog, UserRound, BookUser, UsersRound } from 'lucide-react';
import { AccessRole } from '../types';
import { PermissionKey } from '../permissions';
import { PERMISSION_GROUPS, SYSTEM_SECTIONS, DEFAULT_MODULE_VISIBILITY, normalizeModuleVisibilitySettings, isSystemSectionVisible, type ModuleVisibility, type PermissionGroup, type PermissionRow, type PermissionKind } from '../../../../shared/accessCatalog';
import { filterPermissionGroups, groupPermissionState, toggleGroupPermissions } from '../permissionMatrixModel';
const GROUPS: PermissionGroup[] = PERMISSION_GROUPS.map(group=>({...group,rows:[...group.rows]}));

interface PermissionsMatrixTabProps {
  roles: AccessRole[];
  isLoadingRoles: boolean;
  isSavingRoles: boolean;
  onRolesChange: (roles: AccessRole[]) => void;
  onSaveRoles: () => void;
  onModuleVisibilityChange?: (visibility:ModuleVisibility) => void;
  suPrivilegesPanel?: React.ReactNode;
  isSu?: boolean;
  showSuPermissionsToAdmin?: boolean;
  allowAdminEditSuPermissions?: boolean;
}

const colorClasses = {
  blue: {
    header: 'bg-blue-50 border-blue-200 text-blue-900',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    accent: 'border-l-blue-300'
  },
  sky: {
    header: 'bg-sky-50 border-sky-200 text-sky-900',
    badge: 'bg-sky-100 text-sky-700 border-sky-200',
    accent: 'border-l-sky-300'
  },
  emerald: {
    header: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    accent: 'border-l-emerald-300'
  },
  slate: {
    header: 'bg-slate-50 border-slate-200 text-slate-900',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    accent: 'border-l-slate-300'
  },
  red: {
    header: 'bg-red-50 border-red-200 text-red-900',
    badge: 'bg-red-100 text-red-700 border-red-200',
    accent: 'border-l-red-300'
  }
};

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

const getRoleIcon = (roleId: string, system?: boolean, active = false) => {
  const color = active ? 'text-white' : (system ? 'text-blue-600' : 'text-sky-600');

  if (roleId === 'su') return <ShieldCheck className={`h-4 w-4 ${color}`} />;
  if (roleId === 'admin') return <Crown className={`h-4 w-4 ${color}`} />;
  if (roleId === 'manager') return <UserCog className={`h-4 w-4 ${color}`} />;
  if (roleId === 'operator') return <UserRound className={`h-4 w-4 ${color}`} />;
  if (roleId === 'directory_only') return <BookUser className={`h-4 w-4 ${color}`} />;

  return <UsersRound className={`h-4 w-4 ${color}`} />;
};

export default function PermissionsMatrixTab({
  roles,
  isLoadingRoles,
  isSavingRoles,
  onRolesChange,
  onSaveRoles,
  onModuleVisibilityChange,
  suPrivilegesPanel,
  isSu = false,
  showSuPermissionsToAdmin = false,
  allowAdminEditSuPermissions = false
}: PermissionsMatrixTabProps) {
  const [search, setSearch] = useState('');
  const [isSavingVisibility, setIsSavingVisibility] = useState(false);
  const [visibilityLoaded, setVisibilityLoaded] = useState(false);
  const [isLoadingVisibility, setIsLoadingVisibility] = useState(true);
  const [newRoleName, setNewRoleName] = useState('');
  const [moduleVisibility, setModuleVisibility] = useState<ModuleVisibility>(DEFAULT_MODULE_VISIBILITY);
  const [moduleVisibilityStatus, setModuleVisibilityStatus] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    calls: true,
    directory: true,
    reports: true,
    marketing: true,
    monitoring: true,
    management: true,
    balance: true,
    scripts: true,
    ai_assistant: true,
    ai_pbx_admin: true,
    settings: true,
    users_roles: true,
    system: isSu || showSuPermissionsToAdmin
  });

  const getAuthToken = () => {
    try {
      const raw = localStorage.getItem('asterisk_cdr_session');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.token || '';
    } catch {
      return '';
    }
  };

  const loadModuleVisibility = async () => {
    const token = getAuthToken();
    if (!token) { setIsLoadingVisibility(false); return; }

    try {
      const response = await fetch('/api/settings/module-visibility', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.moduleVisibility) throw new Error('Visibility unavailable');
      if (response.ok && data.moduleVisibility) {
        setVisibilityLoaded(true);
        setModuleVisibility(normalizeModuleVisibilitySettings(data.moduleVisibility));
      }
    } catch {
      setModuleVisibilityStatus('Не удалось загрузить видимость разделов. Обновите страницу перед изменением.');
    } finally { setIsLoadingVisibility(false); }
  };

  const saveModuleVisibility = async (nextVisibility: ModuleVisibility) => {
    const token = getAuthToken();
    if (!token || !isSu || isSavingVisibility || isLoadingVisibility || !visibilityLoaded) return;
    const previousVisibility = moduleVisibility;
    setIsSavingVisibility(true);

    setModuleVisibility(nextVisibility);
    setModuleVisibilityStatus('Сохраняем видимость разделов...');

    try {
      const response = await fetch('/api/settings/module-visibility', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ moduleVisibility: nextVisibility })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось сохранить видимость разделов');
      }

      if (!SYSTEM_SECTIONS.every(({ key }) => data.moduleVisibility?.[key] === nextVisibility[key])) {
        throw new Error('Сервер не применил изменение. Обновите страницу; если ошибка повторится, требуется обновление серверной части.');
      }

      setModuleVisibility(normalizeModuleVisibilitySettings(data.moduleVisibility));
      onModuleVisibilityChange?.(normalizeModuleVisibilitySettings(data.moduleVisibility));
      setModuleVisibilityStatus('Видимость разделов сохранена.');
    } catch (error: any) {
      setModuleVisibility(previousVisibility);
      setModuleVisibilityStatus(error?.message || 'Не удалось сохранить видимость разделов');
    } finally { setIsSavingVisibility(false); }
  };

  useEffect(() => {
    loadModuleVisibility();
  }, []);

  const selectedRole = useMemo(() => {
    if (!roles.length) return null;
    return roles.find(role => role.id === selectedRoleId) || roles[0];
  }, [roles, selectedRoleId]);

  const visibleGroups = GROUPS
    .filter(group => isSystemSectionVisible(isSu ? 'su' : 'admin', moduleVisibility, group.moduleKey))
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => (row.kind !== 'su' || isSu || showSuPermissionsToAdmin) && (!row.moduleKey || isSystemSectionVisible(isSu ? 'su' : 'admin', moduleVisibility, row.moduleKey)))
    }))
    .filter(group => group.rows.length > 0);

  const filteredGroups = filterPermissionGroups(visibleGroups, search);

  const allGroupsOpen = visibleGroups.length > 0 && visibleGroups.every(group => openGroups[group.id] !== false);

  const toggleAllGroups = () => {
    const nextOpen = !allGroupsOpen;
    const nextState: Record<string, boolean> = {};
    for (const group of visibleGroups) {
      nextState[group.id] = nextOpen;
    }
    setOpenGroups(prev => ({ ...prev, ...nextState }));
  };

  const renderModuleVisibilityPanel = () => {
    if (!isSu) return null;

    return (
      <div className="min-w-0">
        <div className="text-sm font-black text-red-900">SU: видимость разделов системы</div>
        <p className="mt-1 text-xs text-red-700">
          Отключенные разделы скрыты от всех, кроме SU. Права ролей сохраняются. Подразделы AI Platform также зависят от переключателя всей платформы. Изменения сохраняются сразу.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {SYSTEM_SECTIONS.map(({key: moduleKey, label}) => (
            <label key={moduleKey} className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={moduleVisibility[moduleKey] !== false}
                disabled={isSavingVisibility || isLoadingVisibility || !visibilityLoaded}
                onChange={(event) => saveModuleVisibility({ ...moduleVisibility, [moduleKey]: event.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {moduleVisibilityStatus && (
          <div className="mt-2 text-xs font-bold text-red-800">{moduleVisibilityStatus}</div>
        )}
      </div>
    );
  };

  const canEditPermission = (permission: PermissionRow) => {
    if (permission.kind !== 'su') return true;
    return isSu || allowAdminEditSuPermissions;
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: prev[groupId] === false }));
  };

  const updateRolePermission = (roleId: string, key: PermissionKey, checked: boolean) => {
    const permission = GROUPS.flatMap(group => group.rows).find(item => item.key === key);
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

  const updateRoleGroup = (group:PermissionGroup,checked:boolean) => {
    if (!selectedRole) return;
    onRolesChange(roles.map(role=>role.id===selectedRole.id ? {...role,permissions:toggleGroupPermissions(group.rows,role.permissions || {},checked,canEditPermission)} : role));
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

    const newRole = {
      id,
      name: cleanName,
      system: false,
      permissions: {}
    };

    onRolesChange([...roles, newRole]);
    setSelectedRoleId(id);
    setNewRoleName('');
  };

  const deleteRole = (roleId: string) => {
    const role = roles.find(item => item.id === roleId);
    if (!role || role.system) return;
    if (!window.confirm(`Удалить роль "${role.name}"?`)) return;

    const nextRoles = roles.filter(item => item.id !== roleId);
    onRolesChange(nextRoles);

    if (selectedRoleId === roleId) {
      setSelectedRoleId(nextRoles[0]?.id || '');
    }
  };

  const groupEnabledCount = (group: PermissionGroup) => {
    if (!selectedRole) return 0;
    return group.rows.filter(row => selectedRole.permissions?.[row.key] === true).length;
  };

  if (isLoadingRoles) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-8 text-center text-sm text-slate-500">Загрузка ролей...</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-clip">
      {isSu && (
        <div className={`m-4 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 ${suPrivilegesPanel ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : ''}`}>
          {suPrivilegesPanel && (
            <div className="min-w-0 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
              {suPrivilegesPanel}
            </div>
          )}
          {renderModuleVisibilityPanel()}
        </div>
      )}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h4 className="text-sm font-black text-slate-900">Матрица доступа</h4>
          <p className="text-xs text-slate-500 mt-1">
            Выберите роль и настройте права по разделам. Синие права открывают вкладки, зеленые включают функции, красные являются служебными.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
          <span className="rounded-full border px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">Вкладка</span>
          <span className="rounded-full border px-2 py-1 bg-emerald-50 text-emerald-700 border-emerald-200">Функция</span>
          {(isSu || showSuPermissionsToAdmin) && (
            <span className="rounded-full border px-2 py-1 bg-red-50 text-red-700 border-red-200">SU</span>
          )}

        </div>
      </div>

      <div className="p-4 border-b border-slate-100 bg-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-wrap gap-2 lg:flex-1 lg:flex-nowrap lg:overflow-x-auto">
            {roles.map(role => {
              const active = selectedRole?.id === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setSelectedRoleId(role.id)}
                  className={
                    active
                      ? 'shrink-0 whitespace-nowrap px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black shadow-sm'
                      : 'shrink-0 whitespace-nowrap px-4 py-2 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold hover:bg-blue-50 hover:text-blue-700'
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    {getRoleIcon(role.id, role.system, active)}
                    <span>{role.name}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Название новой роли"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs lg:w-48 lg:flex-none"
            />
            <button
              type="button"
              onClick={addRole}
              className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" />
              Добавить роль
            </button>
          </div>
        </div>
      </div>

      {!selectedRole ? (
        <div className="p-8 text-center text-sm text-slate-500">Роли пока не загружены.</div>
      ) : (
        <div className="p-4 space-y-3">
          <div className="sticky top-0 z-20 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
              <div className="flex min-w-0 items-center gap-2 text-sm font-black text-blue-900 lg:max-w-[30%]">
                {getRoleIcon(selectedRole.id, selectedRole.system)}
                <span className="truncate" title={selectedRole.name}>Выбрана роль: {selectedRole.name}</span>
              </div>

              <input type="search" aria-label="Поиск прав" title="Список фильтруется при вводе" placeholder="Поиск прав…" value={search} onChange={event=>setSearch(event.target.value)} className="min-w-[160px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <div className="flex shrink-0 items-center gap-3 border-l border-blue-200 pl-3">
              <button
                type="button"
                onClick={toggleAllGroups}
                className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-3 py-2 text-[11px] font-black text-blue-700 hover:bg-blue-50"
              >
                {allGroupsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {allGroupsOpen ? 'Свернуть всё' : 'Развернуть всё'}
              </button>
              <button type="button" disabled={isSavingRoles} onClick={onSaveRoles} className="shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isSavingRoles ? 'Сохранение…' : 'Сохранить права'}</button>
              </div>
            </div>
          </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedRole.system ? null : (
                <>
                  <input
                    type="text"
                    value={selectedRole.name}
                    onChange={(e) => updateRoleName(selectedRole.id, e.target.value)}
                    className="min-w-[260px] rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => deleteRole(selectedRole.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить роль
                  </button>
                </>
              )}
            </div>
          <p className="text-xs text-slate-500">Галочка раздела меняет все доступные права этого раздела, даже при поиске. Ограничения «только свои» и «только подчинённых отделов» настраиваются отдельно.</p>
          {filteredGroups.length===0 && <p role="status" className="p-4 text-sm text-slate-500">Права не найдены. Измените поисковый запрос.</p>}
          {filteredGroups.map(group => {
            const colors = colorClasses[group.color];
            const isOpen = Boolean(search.trim()) || openGroups[group.id] !== false;
            const fullGroup = visibleGroups.find(item=>item.id===group.id)!;
            const groupState = groupPermissionState(fullGroup.rows,selectedRole.permissions || {},canEditPermission);
            const enabledCount = groupEnabledCount(group);

            return (
              <section key={group.id} className={`rounded-xl border overflow-hidden border-l-4 ${colors.accent}`}>
                <div className={`flex items-center gap-3 border-b pr-3 ${colors.header}`}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between gap-3 p-3 border-b text-left ${colors.header}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-black text-sm">{group.title}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${colors.badge}`}>
                        {enabledCount}/{group.rows.length}
                      </span>
                    </div>
                    <div className="mt-1 text-xs opacity-80">{group.description}</div>
                  </div>
                </button>
                <label className="flex shrink-0 items-center gap-2 text-xs font-bold">
                  <input type="checkbox" checked={groupState.checked} disabled={groupState.disabled || isSavingRoles}
                    ref={node=>{ if(node)node.indeterminate=groupState.mixed; }}
                    aria-label={`Все права раздела ${group.title}`} aria-checked={groupState.mixed ? 'mixed' : groupState.checked}
                    onChange={event=>updateRoleGroup(fullGroup,event.target.checked)} />
                  Весь раздел
                </label>
                </div>

                {isOpen && (
                  <div className="bg-white divide-y divide-slate-100">
                    {group.rows.map(permission => {
                      const editable = canEditPermission(permission);
                      const checked = selectedRole.permissions?.[permission.key] === true;

                      return (
                        <label
                          key={permission.key}
                          className={
                            'flex items-center justify-between gap-4 p-3 hover:bg-slate-50 '
                            + (!editable ? 'opacity-70 ' : 'cursor-pointer ')
                          }
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-slate-800">{permission.label}</span>
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${getPermissionBadgeClass(permission.kind)}`}>
                                {getPermissionKindLabel(permission.kind)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-400">{permission.hint}</div>
                          </div>

                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!editable}
                            title={!editable ? 'Изменять это служебное право может только SU' : permission.hint}
                            onChange={(e) => updateRolePermission(selectedRole.id, permission.key, e.target.checked)}
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
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
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
