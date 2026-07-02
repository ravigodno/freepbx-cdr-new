const fs = require('fs');

const files = {
  server: 'server.ts',
  api: 'src/modules/directory/services/directoryApi.ts',
  app: 'src/App.tsx',
};

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOnce(content, search, replace, label) {
  if (!content.includes(search)) {
    throw new Error(`Не найден маркер: ${label}`);
  }
  return content.replace(search, replace);
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

// ---------------- server.ts ----------------

let server = read(files.server);

if (!server.includes('type DirectoryColumnSettingSource')) {
  server = insertBefore(
    server,
    '// --- TELEPHONE DIRECTORY ENDPOINTS ---',
`type DirectoryColumnSettingSource = 'user' | 'global' | 'system';

const DIRECTORY_REQUIRED_COLUMN_KEYS = ['type', 'fullName', 'phone'];
const DIRECTORY_OPTIONAL_COLUMN_KEYS = [
  'visibility',
  'isSpam',
  'organization',
  'position',
  'phone2',
  'email',
  'website',
  'inn',
  'kpp',
  'ogrn',
  'address',
  'comment',
  'department',
  'group',
  'tags',
  'internalExtension',
  'linkedExternalNumber',
  'responsibleUserId'
];
const DIRECTORY_SYSTEM_COLUMN_KEYS = ['actions'];
const DIRECTORY_VISIBLE_COLUMN_KEYS = [...DIRECTORY_REQUIRED_COLUMN_KEYS, ...DIRECTORY_OPTIONAL_COLUMN_KEYS];
const DIRECTORY_DEFAULT_VISIBLE_COLUMNS = ['type', 'fullName', 'phone', 'email', 'organization', 'visibility', 'isSpam'];

function sanitizeDirectoryVisibleColumns(input: any): string[] {
  const values = Array.isArray(input) ? input : [];
  const next: string[] = [];

  for (const value of values) {
    const key = String(value || '').trim();
    if (DIRECTORY_VISIBLE_COLUMN_KEYS.includes(key) && !next.includes(key)) {
      next.push(key);
    }
  }

  if (!next.length) return [...DIRECTORY_DEFAULT_VISIBLE_COLUMNS];

  return [
    ...DIRECTORY_REQUIRED_COLUMN_KEYS.filter(key => !next.includes(key)),
    ...next.filter(key => !DIRECTORY_SYSTEM_COLUMN_KEYS.includes(key))
  ];
}

function ensureDirectoryColumnSettings(localDb: any) {
  if (!localDb.directoryColumnSettings || typeof localDb.directoryColumnSettings !== 'object') {
    localDb.directoryColumnSettings = {};
  }

  if (!localDb.directoryColumnSettings.users || typeof localDb.directoryColumnSettings.users !== 'object') {
    localDb.directoryColumnSettings.users = {};
  }

  return localDb.directoryColumnSettings;
}

function getDirectoryColumnUserKey(req: Request): string {
  const authUser = (req as any).user || {};
  return String(authUser.username || authUser.id || 'unknown');
}

function canManageGlobalDirectoryColumns(req: Request): boolean {
  const authUser = (req as any).user || {};
  return authUser.role === 'su' || authUser.role === 'admin';
}

function getEffectiveDirectoryColumnSettings(localDb: any, req: Request) {
  const settings = ensureDirectoryColumnSettings(localDb);
  const userKey = getDirectoryColumnUserKey(req);
  const userSettings = settings.users?.[userKey];

  if (userSettings && Array.isArray(userSettings.visibleColumns)) {
    return {
      visibleColumns: sanitizeDirectoryVisibleColumns(userSettings.visibleColumns),
      source: 'user' as DirectoryColumnSettingSource,
      canManageGlobal: canManageGlobalDirectoryColumns(req),
      updatedAt: userSettings.updatedAt || null,
      updatedBy: userSettings.updatedBy || null
    };
  }

  if (settings.globalDefault && Array.isArray(settings.globalDefault.visibleColumns)) {
    return {
      visibleColumns: sanitizeDirectoryVisibleColumns(settings.globalDefault.visibleColumns),
      source: 'global' as DirectoryColumnSettingSource,
      canManageGlobal: canManageGlobalDirectoryColumns(req),
      updatedAt: settings.globalDefault.updatedAt || null,
      updatedBy: settings.globalDefault.updatedBy || null
    };
  }

  return {
    visibleColumns: [...DIRECTORY_DEFAULT_VISIBLE_COLUMNS],
    source: 'system' as DirectoryColumnSettingSource,
    canManageGlobal: canManageGlobalDirectoryColumns(req),
    updatedAt: null,
    updatedBy: null
  };
}`,
    'directory column helpers'
  );
}

if (!server.includes("app.get('/api/directory/column-settings'")) {
  server = insertBefore(
    server,
    "app.get('/api/directory', requireAuth(), async (req, res) => {",
`app.get('/api/directory/column-settings', requireAuth(), async (req, res) => {
  if (!(await checkUserPermission(req, 'view_directory'))) {
    return res.status(403).json({ error: 'Access denied: view_directory permission required' });
  }

  try {
    const localDb = await readLocalDb();
    res.json(getEffectiveDirectoryColumnSettings(localDb, req));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось загрузить настройки столбцов' });
  }
});

app.post('/api/directory/column-settings/me', requireAuth(), async (req, res) => {
  if (!(await checkUserPermission(req, 'view_directory'))) {
    return res.status(403).json({ error: 'Access denied: view_directory permission required' });
  }

  try {
    const localDb = await readLocalDb();
    const settings = ensureDirectoryColumnSettings(localDb);
    const userKey = getDirectoryColumnUserKey(req);
    const visibleColumns = sanitizeDirectoryVisibleColumns(req.body?.visibleColumns);
    const now = new Date().toISOString();

    settings.users[userKey] = {
      visibleColumns,
      updatedAt: now,
      updatedBy: userKey
    };

    await writeLocalDb(localDb);
    res.json({
      visibleColumns,
      source: 'user',
      canManageGlobal: canManageGlobalDirectoryColumns(req),
      updatedAt: now
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось сохранить настройки столбцов' });
  }
});

app.delete('/api/directory/column-settings/me', requireAuth(), async (req, res) => {
  if (!(await checkUserPermission(req, 'view_directory'))) {
    return res.status(403).json({ error: 'Access denied: view_directory permission required' });
  }

  try {
    const localDb = await readLocalDb();
    const settings = ensureDirectoryColumnSettings(localDb);
    const userKey = getDirectoryColumnUserKey(req);

    if (settings.users && settings.users[userKey]) {
      delete settings.users[userKey];
    }

    await writeLocalDb(localDb);
    res.json(getEffectiveDirectoryColumnSettings(localDb, req));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось сбросить личные настройки столбцов' });
  }
});

app.post('/api/directory/column-settings/global', requireAuth(), async (req, res) => {
  if (!canManageGlobalDirectoryColumns(req)) {
    return res.status(403).json({ error: 'Access denied: su/admin required' });
  }

  try {
    const localDb = await readLocalDb();
    const settings = ensureDirectoryColumnSettings(localDb);
    const userKey = getDirectoryColumnUserKey(req);
    const visibleColumns = sanitizeDirectoryVisibleColumns(req.body?.visibleColumns);
    const now = new Date().toISOString();

    settings.globalDefault = {
      visibleColumns,
      updatedAt: now,
      updatedBy: userKey
    };

    await writeLocalDb(localDb);
    res.json({
      visibleColumns,
      source: 'global',
      canManageGlobal: true,
      updatedAt: now
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось сохранить базовые настройки столбцов' });
  }
});

app.delete('/api/directory/column-settings/global', requireAuth(), async (req, res) => {
  if (!canManageGlobalDirectoryColumns(req)) {
    return res.status(403).json({ error: 'Access denied: su/admin required' });
  }

  try {
    const localDb = await readLocalDb();
    const settings = ensureDirectoryColumnSettings(localDb);

    if (settings.globalDefault) {
      delete settings.globalDefault;
    }

    await writeLocalDb(localDb);
    res.json(getEffectiveDirectoryColumnSettings(localDb, req));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Не удалось сбросить базовые настройки столбцов' });
  }
});`,
    'directory column endpoints'
  );
}

if (!server.includes('directoryColumnSettings: db?.directoryColumnSettings')) {
  server = replaceOnce(
    server,
    `    contactSyncMappings: Array.isArray(db?.contactSyncMappings) ? db.contactSyncMappings : []
  };`,
    `    contactSyncMappings: Array.isArray(db?.contactSyncMappings) ? db.contactSyncMappings : [],
    directoryColumnSettings: db?.directoryColumnSettings && typeof db.directoryColumnSettings === 'object' ? db.directoryColumnSettings : {}
  };`,
    'normalizeLocalDbSchema directoryColumnSettings'
  );
}

if (!server.includes('directoryColumnSettings: {},')) {
  server = replaceOnce(
    server,
    `    contactSyncMappings: [],
    roles: getDefaultAccessRoles(),`,
    `    contactSyncMappings: [],
    directoryColumnSettings: {},
    roles: getDefaultAccessRoles(),`,
    'getDefaultLocalDb directoryColumnSettings'
  );
}

write(files.server, server);

// ---------------- directoryApi.ts ----------------

let api = read(files.api);

if (!api.includes('export interface DirectoryColumnSettingsResponse')) {
  api = insertAfter(
    api,
    `export interface DirectoryPageResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}`,
`export interface DirectoryColumnSettingsResponse {
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
}`,
    'DirectoryColumnSettingsResponse'
  );
}

if (!api.includes('fetchDirectoryColumnSettings')) {
  api += `

export async function fetchDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings', {
    headers: {
      Authorization: \`Bearer \${token}\`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось загрузить настройки столбцов');
}

export async function saveMyDirectoryColumnSettings(token: string, visibleColumns: string[]): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/me', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`
    },
    body: JSON.stringify({ visibleColumns })
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сохранить личные настройки столбцов');
}

export async function resetMyDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/me', {
    method: 'DELETE',
    headers: {
      Authorization: \`Bearer \${token}\`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сбросить личные настройки столбцов');
}

export async function saveGlobalDirectoryColumnSettings(token: string, visibleColumns: string[]): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/global', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: \`Bearer \${token}\`
    },
    body: JSON.stringify({ visibleColumns })
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сохранить базовые настройки столбцов');
}

export async function resetGlobalDirectoryColumnSettings(token: string): Promise<DirectoryColumnSettingsResponse> {
  const resp = await fetch('/api/directory/column-settings/global', {
    method: 'DELETE',
    headers: {
      Authorization: \`Bearer \${token}\`
    }
  });

  return parseDirectorySettingsResponse(resp, 'Не удалось сбросить базовые настройки столбцов');
}
`;
}

write(files.api, api);

// ---------------- App.tsx ----------------

let app = read(files.app);

app = app.replace(`const DIRECTORY_COLUMNS_STORAGE_KEY = 'pbxpuls.directory.columns.personal';\n`, '');

if (!app.includes('type DirectoryColumnSettingsSource')) {
  app = insertAfter(
    app,
    `type DirectoryVisibleColumnKey = DirectoryRequiredColumnKey | DirectoryOptionalColumnKey;`,
`type DirectoryColumnSettingsSource = 'user' | 'global' | 'system';`,
    'DirectoryColumnSettingsSource'
  );
}

if (!app.includes('const getDirectoryColumnSettingsSourceLabel')) {
  app = insertAfter(
    app,
    `const loadDirectoryVisibleColumns = (): DirectoryVisibleColumnKey[] => {
  try {
    const raw = localStorage.getItem(DIRECTORY_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultDirectoryVisibleColumns;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.visibleColumns)) return sanitizeDirectoryVisibleColumns(parsed.visibleColumns);
    if (Array.isArray(parsed?.optionalColumns)) return sanitizeDirectoryVisibleColumns([...requiredDirectoryColumns, ...parsed.optionalColumns]);
    return defaultDirectoryVisibleColumns;
  } catch {
    return defaultDirectoryVisibleColumns;
  }
};`,
`const getDirectoryColumnSettingsSourceLabel = (source: DirectoryColumnSettingsSource) => {
  if (source === 'user') return 'личная настройка';
  if (source === 'global') return 'базовая настройка';
  return 'системная настройка';
};`,
    'source label helper'
  );

  app = app.replace(
`const loadDirectoryVisibleColumns = (): DirectoryVisibleColumnKey[] => {
  try {
    const raw = localStorage.getItem(DIRECTORY_COLUMNS_STORAGE_KEY);
    if (!raw) return defaultDirectoryVisibleColumns;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.visibleColumns)) return sanitizeDirectoryVisibleColumns(parsed.visibleColumns);
    if (Array.isArray(parsed?.optionalColumns)) return sanitizeDirectoryVisibleColumns([...requiredDirectoryColumns, ...parsed.optionalColumns]);
    return defaultDirectoryVisibleColumns;
  } catch {
    return defaultDirectoryVisibleColumns;
  }
};`,
`const loadDirectoryVisibleColumns = (): DirectoryVisibleColumnKey[] => defaultDirectoryVisibleColumns;`
  );
}

if (!app.includes('fetchDirectoryColumnSettings')) {
  app = app.replace(
    /import\s*\{([^}]*fetchDirectory[^}]*)\}\s*from\s*['"]\.\/modules\/directory\/services\/directoryApi['"];/s,
    (match, imports) => {
      const needed = [
        'fetchDirectoryColumnSettings',
        'saveMyDirectoryColumnSettings',
        'resetMyDirectoryColumnSettings',
        'saveGlobalDirectoryColumnSettings',
        'resetGlobalDirectoryColumnSettings'
      ];
      const nextImports = imports.trim();
      return `import { ${nextImports}, ${needed.join(', ')} } from './modules/directory/services/directoryApi';`;
    }
  );
}

if (!app.includes('directoryColumnSettingsSource')) {
  const stateMarker = `const [selectedDirectoryVisibleColumns, setSelectedDirectoryVisibleColumns] = useState<DirectoryVisibleColumnKey[]>(loadDirectoryVisibleColumns);`;
  if (app.includes(stateMarker)) {
    app = insertAfter(
      app,
      stateMarker,
`  const [directoryColumnSettingsSource, setDirectoryColumnSettingsSource] = useState<DirectoryColumnSettingsSource>('system');
  const [canManageGlobalDirectoryColumns, setCanManageGlobalDirectoryColumns] = useState(false);
  const [directoryColumnSettingsStatus, setDirectoryColumnSettingsStatus] = useState('');`,
      'directory column states'
    );
  } else {
    console.warn('WARN: не найден stateMarker selectedDirectoryVisibleColumns. App.tsx backend/api пропатчены, UI надо будет доделать вручную.');
  }
}

if (!app.includes('loadDirectoryColumnSettingsFromApi')) {
  const marker = `  const saveDirectoryColumnSettings = () => {`;
  if (app.includes(marker)) {
    app = insertBefore(
      app,
      marker,
`  const loadDirectoryColumnSettingsFromApi = async () => {
    if (!session?.token) return;
    try {
      const response = await fetchDirectoryColumnSettings(session.token);
      const visibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(visibleColumns);
      setDraftDirectoryVisibleColumns(visibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'system');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось загрузить настройки столбцов');
    }
  };

  useEffect(() => {
    if (activeView === 'directory' && session?.token) {
      loadDirectoryColumnSettingsFromApi();
    }
  }, [activeView, session?.token]);`,
      'loadDirectoryColumnSettingsFromApi'
    );
  }
}

app = app.replace(
`  const saveDirectoryColumnSettings = () => {
    const visibleColumns = sanitizeDirectoryVisibleColumns(draftDirectoryVisibleColumns);
    setSelectedDirectoryVisibleColumns(visibleColumns);
    localStorage.setItem(DIRECTORY_COLUMNS_STORAGE_KEY, JSON.stringify({ visibleColumns }));
    setIsDirectoryColumnsPanelOpen(false);
  };

  const resetDirectoryColumnSettings = () => {
    localStorage.removeItem(DIRECTORY_COLUMNS_STORAGE_KEY);
    setSelectedDirectoryVisibleColumns(defaultDirectoryVisibleColumns);
    setDraftDirectoryVisibleColumns(defaultDirectoryVisibleColumns);
    setIsDirectoryColumnsPanelOpen(false);
  };`,
`  const saveDirectoryColumnSettings = async () => {
    if (!session?.token) return;
    const visibleColumns = sanitizeDirectoryVisibleColumns(draftDirectoryVisibleColumns);
    try {
      const response = await saveMyDirectoryColumnSettings(session.token, visibleColumns);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(nextVisibleColumns);
      setDraftDirectoryVisibleColumns(nextVisibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'user');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Личные настройки столбцов сохранены.');
      setIsDirectoryColumnsPanelOpen(false);
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сохранить настройки столбцов');
    }
  };

  const resetDirectoryColumnSettings = async () => {
    if (!session?.token) return;
    try {
      const response = await resetMyDirectoryColumnSettings(session.token);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      setSelectedDirectoryVisibleColumns(nextVisibleColumns);
      setDraftDirectoryVisibleColumns(nextVisibleColumns);
      setDirectoryColumnSettingsSource(response.source || 'system');
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Личные настройки сброшены.');
      setIsDirectoryColumnsPanelOpen(false);
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сбросить настройки столбцов');
    }
  };

  const saveGlobalDirectoryColumnSettingsForAll = async () => {
    if (!session?.token) return;
    const visibleColumns = sanitizeDirectoryVisibleColumns(draftDirectoryVisibleColumns);
    try {
      const response = await saveGlobalDirectoryColumnSettings(session.token, visibleColumns);
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Базовые настройки столбцов для всех сохранены.');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сохранить базовые настройки столбцов');
    }
  };

  const resetGlobalDirectoryColumnSettingsForAll = async () => {
    if (!session?.token) return;
    try {
      const response = await resetGlobalDirectoryColumnSettings(session.token);
      const nextVisibleColumns = sanitizeDirectoryVisibleColumns(response.visibleColumns);
      if (directoryColumnSettingsSource !== 'user') {
        setSelectedDirectoryVisibleColumns(nextVisibleColumns);
        setDraftDirectoryVisibleColumns(nextVisibleColumns);
        setDirectoryColumnSettingsSource(response.source || 'system');
      }
      setCanManageGlobalDirectoryColumns(!!response.canManageGlobal);
      setDirectoryColumnSettingsStatus('Базовые настройки столбцов сброшены.');
    } catch (error: any) {
      setDirectoryColumnSettingsStatus(error?.message || 'Не удалось сбросить базовые настройки столбцов');
    }
  };`
);

if (!app.includes('Текущий источник столбцов')) {
  app = app.replace(
`                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  Выберите дополнительные поля и задайте порядок столбцов. Экспорт CSV выгружает полный набор полей, даже если часть столбцов скрыта или изменен порядок таблицы.
                </p>`,
`                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
                  Выберите дополнительные поля и задайте порядок столбцов. Экспорт CSV выгружает полный набор полей, даже если часть столбцов скрыта или изменен порядок таблицы.
                </p>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">
                  Текущий источник столбцов: {getDirectoryColumnSettingsSourceLabel(directoryColumnSettingsSource)}.
                </p>
                {directoryColumnSettingsStatus && (
                  <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">
                    {directoryColumnSettingsStatus}
                  </p>
                )}`
  );
}

if (!app.includes('saveGlobalDirectoryColumnSettingsForAll')) {
  console.warn('WARN: saveGlobalDirectoryColumnSettingsForAll не найден после замены');
}

if (!app.includes('Сохранить как базовые для всех')) {
  app = app.replace(
`              <button
                type="button"
                onClick={resetDirectoryColumnSettings}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Сбросить мои настройки
              </button>`,
`              {canManageGlobalDirectoryColumns && (
                <>
                  <button
                    type="button"
                    onClick={saveGlobalDirectoryColumnSettingsForAll}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Сохранить как базовые для всех
                  </button>
                  <button
                    type="button"
                    onClick={resetGlobalDirectoryColumnSettingsForAll}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    Сбросить базовые
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={resetDirectoryColumnSettings}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Сбросить мои настройки
              </button>`
  );
}

write(files.app, app);

console.log('Patch applied. Run: npm run lint && npm run build');
