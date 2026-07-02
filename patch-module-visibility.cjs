const fs = require('fs');

const files = {
  server: 'server.ts',
  permissions: 'src/modules/access/permissions.ts',
  matrix: 'src/modules/access/components/PermissionsMatrixTab.tsx'
};

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function insertBefore(content, marker, insert, label) {
  if (!content.includes(marker)) {
    throw new Error(`Не найден маркер для вставки перед: ${label}`);
  }
  return content.replace(marker, insert + '\n\n' + marker);
}

function insertAfter(content, marker, insert, label) {
  if (!content.includes(marker)) {
    throw new Error(`Не найден маркер для вставки после: ${label}`);
  }
  return content.replace(marker, marker + '\n\n' + insert);
}

// ----------------------------------------------------
// 1. server.ts — moduleVisibility в settings + backend helpers
// ----------------------------------------------------

let server = read(files.server);

if (!server.includes('moduleVisibility: {')) {
  server = server.replace(
    `      allowAdminEditSuPermissions: false`,
    `      allowAdminEditSuPermissions: false,
      moduleVisibility: {
        marketing: true,
        monitoring: true,
        management: true,
        balance: true
      }`
  );
}

if (!server.includes('normalizeModuleVisibilitySettings')) {
  server = insertBefore(
    server,
    `function normalizeLocalDbSchema(db: any): any {`,
`type OptionalModuleKey = 'marketing' | 'monitoring' | 'management' | 'balance';

const OPTIONAL_MODULE_KEYS: OptionalModuleKey[] = ['marketing', 'monitoring', 'management', 'balance'];

const DEFAULT_MODULE_VISIBILITY: Record<OptionalModuleKey, boolean> = {
  marketing: true,
  monitoring: true,
  management: true,
  balance: true
};

const PERMISSION_MODULE_MAP: Record<string, OptionalModuleKey> = {
  view_marketing: 'marketing',
  manage_marketing: 'marketing',
  manage_calltracking: 'marketing',
  manage_yandex_metrika: 'marketing',
  manage_yandex_direct: 'marketing',

  view_monitoring: 'monitoring',
  view_active_calls: 'monitoring',
  view_tcpdump: 'monitoring',
  view_sngrep: 'monitoring',
  view_cli: 'monitoring',
  view_sip_devices_map: 'monitoring',

  view_management: 'management',
  dangerous_pbx_write: 'management',
  bulk_extensions: 'management',
  manage_trunks: 'management',
  manage_outbound_routes: 'management',
  manage_numbering_capacity: 'management',

  view_balance: 'balance',
  view_balance_analytics: 'balance',
  manage_balance_sources: 'balance',
  view_balance_alerts: 'balance',
  manage_balance_providers: 'balance'
};

function normalizeModuleVisibilitySettings(value: any): Record<OptionalModuleKey, boolean> {
  const next: Record<OptionalModuleKey, boolean> = { ...DEFAULT_MODULE_VISIBILITY };

  if (value && typeof value === 'object') {
    for (const key of OPTIONAL_MODULE_KEYS) {
      if (typeof value[key] === 'boolean') {
        next[key] = value[key];
      }
    }
  }

  return next;
}

function isModuleVisibleForAuthUser(authUser: any, localDb: any, moduleKey: OptionalModuleKey): boolean {
  if (authUser?.role === 'su') return true;
  const visibility = normalizeModuleVisibilitySettings(localDb?.settings?.moduleVisibility);
  return visibility[moduleKey] !== false;
}

function isPermissionAllowedByModuleVisibility(authUser: any, localDb: any, permission: string): boolean {
  if (authUser?.role === 'su') return true;
  const moduleKey = PERMISSION_MODULE_MAP[permission];
  if (!moduleKey) return true;
  return isModuleVisibleForAuthUser(authUser, localDb, moduleKey);
}`,
    'module visibility helpers'
  );
}

// normalizeLocalDbSchema: после next собираем нормализованный moduleVisibility
if (!server.includes('next.settings.moduleVisibility = normalizeModuleVisibilitySettings(next.settings.moduleVisibility);')) {
  server = server.replace(
    `  return next;
}`,
    `  next.settings.moduleVisibility = normalizeModuleVisibilitySettings(next.settings.moduleVisibility);

  return next;
}`
  );
}

// readLocalDb: старые БД тоже нормализуем и сохраняем при необходимости
if (!server.includes('data.settings.moduleVisibility = normalizeModuleVisibilitySettings(data.settings?.moduleVisibility);')) {
  server = server.replace(
    `    if (!Array.isArray((data as any).contactSyncMappings)) {
      (data as any).contactSyncMappings = [];
      changed = true;
    }`,
    `    if (!Array.isArray((data as any).contactSyncMappings)) {
      (data as any).contactSyncMappings = [];
      changed = true;
    }

    const normalizedModuleVisibility = normalizeModuleVisibilitySettings(data.settings?.moduleVisibility);
    if (JSON.stringify(data.settings?.moduleVisibility || {}) !== JSON.stringify(normalizedModuleVisibility)) {
      if (!data.settings || typeof data.settings !== 'object') data.settings = {};
      data.settings.moduleVisibility = normalizedModuleVisibility;
      changed = true;
    }`
  );
}

// checkUserPermission: добавляем проверку глобальной видимости модулей
if (!server.includes('isPermissionAllowedByModuleVisibility(dbUser || sessionUser')) {
  const marker = `    if (dbUser.role === 'su') return true;`;
  if (server.includes(marker)) {
    server = server.replace(
      marker,
      `${marker}

    if (!isPermissionAllowedByModuleVisibility(dbUser || sessionUser, localDb, perm)) {
      return false;
    }`
    );
  } else {
    console.warn('WARN: не найдено место в checkUserPermission для moduleVisibility');
  }
}

// API module visibility
if (!server.includes("app.get('/api/settings/module-visibility'")) {
  const apiBlock = `app.get('/api/settings/module-visibility', requireAuth(), async (req, res) => {
  try {
    const localDb = await readLocalDb();
    res.json({
      moduleVisibility: normalizeModuleVisibilitySettings(localDb.settings?.moduleVisibility)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось загрузить видимость разделов' });
  }
});

app.put('/api/settings/module-visibility', requireAuth(), async (req, res) => {
  const authUser = (req as any).user;

  if (authUser?.role !== 'su') {
    return res.status(403).json({ error: 'Only SU can manage module visibility' });
  }

  try {
    const localDb = await readLocalDb();
    const current = normalizeModuleVisibilitySettings(localDb.settings?.moduleVisibility);
    const incoming = req.body?.moduleVisibility && typeof req.body.moduleVisibility === 'object'
      ? req.body.moduleVisibility
      : req.body;

    const next = { ...current };

    for (const key of OPTIONAL_MODULE_KEYS) {
      if (typeof incoming?.[key] === 'boolean') {
        next[key] = incoming[key];
      }
    }

    localDb.settings.moduleVisibility = next;
    await writeLocalDb(localDb);

    res.json({ moduleVisibility: next });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось сохранить видимость разделов' });
  }
});`;

  server = insertBefore(
    server,
    `app.get('/api/roles', requireAuth(), async (req, res) => {`,
    apiBlock,
    'module visibility API'
  );
}

write(files.server, server);

// ----------------------------------------------------
// 2. permissions.ts — frontend hasUserPermission тоже учитывает moduleVisibility
// ----------------------------------------------------

let permissions = read(files.permissions);

if (!permissions.includes('type OptionalModuleKey')) {
  permissions = insertAfter(
    permissions,
    `export interface PermissionSession {
  role: UserRole;
  permissions?: UserPermissions;
}`,
`type OptionalModuleKey = 'marketing' | 'monitoring' | 'management' | 'balance';

const PERMISSION_MODULE_MAP: Partial<Record<PermissionKey, OptionalModuleKey>> = {
  view_marketing: 'marketing',
  manage_marketing: 'marketing',
  manage_calltracking: 'marketing',
  manage_yandex_metrika: 'marketing',
  manage_yandex_direct: 'marketing',

  view_monitoring: 'monitoring',
  view_active_calls: 'monitoring',
  view_tcpdump: 'monitoring',
  view_sngrep: 'monitoring',
  view_cli: 'monitoring',
  view_sip_devices_map: 'monitoring',

  view_management: 'management',
  dangerous_pbx_write: 'management',
  bulk_extensions: 'management',
  manage_trunks: 'management',
  manage_outbound_routes: 'management',
  manage_numbering_capacity: 'management',

  view_balance: 'balance',
  view_balance_analytics: 'balance',
  manage_balance_sources: 'balance',
  view_balance_alerts: 'balance',
  manage_balance_providers: 'balance'
};

function isPermissionAllowedByModuleVisibility(
  session: PermissionSession,
  settings: Partial<AppSettings> | null | undefined,
  perm: PermissionKey
): boolean {
  if (session.role === 'su') return true;

  const moduleKey = PERMISSION_MODULE_MAP[perm];
  if (!moduleKey) return true;

  const moduleVisibility = (settings as any)?.moduleVisibility || {};
  return moduleVisibility[moduleKey] !== false;
}`,
    'frontend module visibility helper'
  );
}

if (!permissions.includes("if (!isPermissionAllowedByModuleVisibility(session, settings, perm)) return false;")) {
  permissions = permissions.replace(
    `  if (session.role === 'su') return true;

  if (session.permissions && Object.prototype.hasOwnProperty.call(session.permissions, perm)) {`,
    `  if (session.role === 'su') return true;

  if (!isPermissionAllowedByModuleVisibility(session, settings, perm)) return false;

  if (session.permissions && Object.prototype.hasOwnProperty.call(session.permissions, perm)) {`
  );
}

write(files.permissions, permissions);

// ----------------------------------------------------
// 3. PermissionsMatrixTab.tsx — скрываем отключенные SU модули от admin
// ----------------------------------------------------

let matrix = read(files.matrix);

matrix = matrix.replace(
  `import React, { useMemo, useState } from 'react';`,
  `import React, { useEffect, useMemo, useState } from 'react';`
);

if (!matrix.includes("type OptionalModuleKey = 'marketing'")) {
  matrix = insertAfter(
    matrix,
    `type PermissionKind = 'tab' | 'feature' | 'su';`,
`type OptionalModuleKey = 'marketing' | 'monitoring' | 'management' | 'balance';

const DEFAULT_MODULE_VISIBILITY: Record<OptionalModuleKey, boolean> = {
  marketing: true,
  monitoring: true,
  management: true,
  balance: true
};`,
    'matrix module visibility types'
  );
}

if (!matrix.includes('moduleKey?: OptionalModuleKey;')) {
  matrix = matrix.replace(
    `  color: 'blue' | 'emerald' | 'sky' | 'slate' | 'red';
  rows: PermissionRow[];`,
    `  color: 'blue' | 'emerald' | 'sky' | 'slate' | 'red';
  moduleKey?: OptionalModuleKey;
  rows: PermissionRow[];`
  );
}

// Добавляем moduleKey в группы
matrix = matrix.replace(
  `    id: 'marketing',
    title: 'Маркетинг',`,
  `    id: 'marketing',
    title: 'Маркетинг',
    moduleKey: 'marketing',`
);

matrix = matrix.replace(
  `    id: 'monitoring',
    title: 'Мониторинг',`,
  `    id: 'monitoring',
    title: 'Мониторинг',
    moduleKey: 'monitoring',`
);

matrix = matrix.replace(
  `    id: 'management',
    title: 'Управление АТС',`,
  `    id: 'management',
    title: 'Управление АТС',
    moduleKey: 'management',`
);

matrix = matrix.replace(
  `    id: 'balance',
    title: 'Баланс',`,
  `    id: 'balance',
    title: 'Баланс',
    moduleKey: 'balance',`
);

// state для moduleVisibility
if (!matrix.includes('const [moduleVisibility, setModuleVisibility]')) {
  matrix = matrix.replace(
    `  const [newRoleName, setNewRoleName] = useState('');`,
    `  const [newRoleName, setNewRoleName] = useState('');
  const [moduleVisibility, setModuleVisibility] = useState<Record<OptionalModuleKey, boolean>>(DEFAULT_MODULE_VISIBILITY);
  const [moduleVisibilityStatus, setModuleVisibilityStatus] = useState('');`
  );
}

// load API
if (!matrix.includes('loadModuleVisibility')) {
  matrix = insertAfter(
    matrix,
    `  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    calls: true,
    directory: true,
    reports: true,
    marketing: true,
    monitoring: true,
    management: true,
    balance: true,
    settings: true,
    users_roles: true,
    system: isSu || showSuPermissionsToAdmin
  });`,
`  const getAuthToken = () => {
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
    if (!token) return;

    try {
      const response = await fetch('/api/settings/module-visibility', {
        headers: { Authorization: \`Bearer \${token}\` }
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.moduleVisibility) {
        setModuleVisibility({ ...DEFAULT_MODULE_VISIBILITY, ...data.moduleVisibility });
      }
    } catch {
      // Не блокируем матрицу прав, если настройка временно недоступна.
    }
  };

  const saveModuleVisibility = async (nextVisibility: Record<OptionalModuleKey, boolean>) => {
    const token = getAuthToken();
    if (!token || !isSu) return;

    setModuleVisibility(nextVisibility);
    setModuleVisibilityStatus('Сохраняем видимость разделов...');

    try {
      const response = await fetch('/api/settings/module-visibility', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${token}\`
        },
        body: JSON.stringify({ moduleVisibility: nextVisibility })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Не удалось сохранить видимость разделов');
      }

      setModuleVisibility({ ...DEFAULT_MODULE_VISIBILITY, ...data.moduleVisibility });
      setModuleVisibilityStatus('Видимость разделов сохранена.');
    } catch (error: any) {
      setModuleVisibilityStatus(error?.message || 'Не удалось сохранить видимость разделов');
    }
  };

  useEffect(() => {
    loadModuleVisibility();
  }, []);`,
    'loadModuleVisibility'
  );
}

// visibleGroups фильтр
matrix = matrix.replace(
  `  const visibleGroups = GROUPS
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => row.kind !== 'su' || isSu || showSuPermissionsToAdmin)
    }))
    .filter(group => group.rows.length > 0);`,
  `  const visibleGroups = GROUPS
    .filter(group => isSu || !group.moduleKey || moduleVisibility[group.moduleKey] !== false)
    .map(group => ({
      ...group,
      rows: group.rows.filter(row => row.kind !== 'su' || isSu || showSuPermissionsToAdmin)
    }))
    .filter(group => group.rows.length > 0);`
);

// Добавляем простую SU-панель перед return-контентом.
// Ищем первый "return (" и вставляем const jsx helper перед ним.
if (!matrix.includes('const renderModuleVisibilityPanel')) {
  matrix = matrix.replace(
    `  const canEditPermission = (permission: PermissionRow) => {`,
    `  const renderModuleVisibilityPanel = () => {
    if (!isSu) return null;

    const labels: Record<OptionalModuleKey, string> = {
      marketing: 'Маркетинг',
      monitoring: 'Мониторинг',
      management: 'Управление АТС',
      balance: 'Баланс'
    };

    return (
      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-black text-red-900">SU: видимость разделов системы</div>
        <p className="mt-1 text-xs text-red-700">
          Реестр звонков, Справочник и Отчеты всегда включены. Отключенные ниже разделы будут скрыты от всех, кроме SU.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(labels) as OptionalModuleKey[]).map(moduleKey => (
            <label key={moduleKey} className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
              <input
                type="checkbox"
                checked={moduleVisibility[moduleKey] !== false}
                onChange={(event) => saveModuleVisibility({ ...moduleVisibility, [moduleKey]: event.target.checked })}
                className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span>{labels[moduleKey]}</span>
            </label>
          ))}
        </div>
        {moduleVisibilityStatus && (
          <div className="mt-2 text-xs font-bold text-red-800">{moduleVisibilityStatus}</div>
        )}
      </div>
    );
  };

  const canEditPermission = (permission: PermissionRow) => {`
  );
}

// Вставляем вызов панели сразу после return opening.
// Ищем первый большой контейнер по фразе "Матрица прав", если не получится — только компиляция покажет.
if (!matrix.includes('{renderModuleVisibilityPanel()}')) {
  const titleMarker = `<div className="flex flex-col gap-4`;
  const idx = matrix.indexOf(titleMarker);
  if (idx !== -1) {
    const insertAt = matrix.indexOf('>', idx);
    matrix = matrix.slice(0, insertAt + 1) + `\n      {renderModuleVisibilityPanel()}` + matrix.slice(insertAt + 1);
  } else {
    console.warn('WARN: не удалось автоматически вставить renderModuleVisibilityPanel в JSX. Фильтрация матрицы все равно работает.');
  }
}

write(files.matrix, matrix);

console.log('OK: moduleVisibility backend/frontend/matrix patch applied.');
