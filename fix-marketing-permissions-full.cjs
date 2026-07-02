const fs = require('fs');

const files = {
  app: 'src/App.tsx',
  permissions: 'src/modules/access/permissions.ts',
  roleMatrix: 'src/modules/access/roleMatrix.ts',
  matrix: 'src/modules/access/components/PermissionsMatrixTab.tsx',
  usersTab: 'src/modules/access/components/AccessUsersTab.tsx',
  server: 'server.ts'
};

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceAll(content, search, replace) {
  return content.split(search).join(replace);
}

// ----------------------------------------------------
// 1. permissions.ts — добавляем PermissionKey для маркетинга
// ----------------------------------------------------
let permissions = read(files.permissions);

if (!permissions.includes("| 'view_marketing'")) {
  permissions = permissions.replace(
    "  | 'view_reports'\n",
    "  | 'view_reports'\n  | 'view_marketing'\n  | 'manage_marketing'\n  | 'manage_calltracking'\n  | 'manage_yandex_metrika'\n  | 'manage_yandex_direct'\n"
  );
}

write(files.permissions, permissions);

// ----------------------------------------------------
// 2. roleMatrix.ts — admin получает маркетинг по умолчанию
// manager НЕ получает маркетинг, пока не включишь галки
// ----------------------------------------------------
let roleMatrix = read(files.roleMatrix);

if (!roleMatrix.includes("'view_marketing'")) {
  const adminReports = "    'view_reports',\n    'listen_recordings',";
  if (roleMatrix.includes(adminReports)) {
    roleMatrix = roleMatrix.replace(
      adminReports,
      "    'view_reports',\n    'view_marketing',\n    'manage_marketing',\n    'manage_calltracking',\n    'manage_yandex_metrika',\n    'manage_yandex_direct',\n    'listen_recordings',"
    );
  }
}

write(files.roleMatrix, roleMatrix);

// ----------------------------------------------------
// 3. PermissionsMatrixTab.tsx — добавляем группу Маркетинг
// ----------------------------------------------------
let matrix = read(files.matrix);

if (!matrix.includes("id: 'marketing'")) {
  const reportsGroup = `  {
    id: 'reports',
    title: 'Отчеты',
    description: 'Отчеты, аналитика и выгрузки.',
    color: 'blue',
    rows: [
      { key: 'view_reports', label: 'Открыть вкладку отчетов', kind: 'tab', hint: 'Показывает отчеты и аналитику' },
      { key: 'export_excel', label: 'Экспорт Excel', kind: 'feature', hint: 'Разрешает выгрузку таблиц и отчетов' }
    ]
  },`;

  const marketingGroup = `${reportsGroup}
  {
    id: 'marketing',
    title: 'Маркетинг',
    description: 'CallTracking, Яндекс Метрика, Яндекс Директ и рекламная аналитика.',
    color: 'blue',
    rows: [
      { key: 'view_marketing', label: 'Открыть вкладку маркетинга', kind: 'tab', hint: 'Показывает раздел Маркетинг' },
      { key: 'manage_marketing', label: 'Управление маркетингом', kind: 'feature', hint: 'Разрешает изменять маркетинговые настройки' },
      { key: 'manage_calltracking', label: 'CallTracking', kind: 'feature', hint: 'Разрешает управлять сайтами, номерами и правилами подмены' },
      { key: 'manage_yandex_metrika', label: 'Яндекс Метрика', kind: 'feature', hint: 'Разрешает подключать счетчики, цели и интеграции Метрики' },
      { key: 'manage_yandex_direct', label: 'Яндекс Директ', kind: 'feature', hint: 'Разрешает управлять настройками расходов и отчетами Директа' }
    ]
  },`;

  if (!matrix.includes(reportsGroup)) {
    throw new Error('Не найден блок reports в PermissionsMatrixTab.tsx');
  }

  matrix = matrix.replace(reportsGroup, marketingGroup);
}

if (!matrix.includes("    marketing: true,")) {
  matrix = matrix.replace(
    "    reports: true,\n    monitoring: true,",
    "    reports: true,\n    marketing: true,\n    monitoring: true,"
  );
}

write(files.matrix, matrix);

// ----------------------------------------------------
// 4. AccessUsersTab.tsx — добавляем быстрые галки маркетинга
// если там есть простой список permissionRows
// ----------------------------------------------------
if (fs.existsSync(files.usersTab)) {
  let usersTab = read(files.usersTab);

  if (!usersTab.includes("key: 'view_marketing'")) {
    const reportsRow = "{ key: 'view_reports', label: 'Просмотр отчетов', description: 'Доступ к отчетам и статистике' },";
    if (usersTab.includes(reportsRow)) {
      usersTab = usersTab.replace(
        reportsRow,
        `${reportsRow}
    { key: 'view_marketing', label: 'Просмотр маркетинга', description: 'Доступ к вкладке Маркетинг' },
    { key: 'manage_marketing', label: 'Управление маркетингом', description: 'Настройки маркетинговых интеграций' },`
      );
    }
  }

  write(files.usersTab, usersTab);
}

// ----------------------------------------------------
// 5. App.tsx — чиним меню и проверки view
// ----------------------------------------------------
let app = read(files.app);

// Доступ к marketing view только через view_marketing
app = app.replace(
  "if (view === 'marketing') return hasPermission('view_reports');",
  "if (view === 'marketing') return hasPermission('view_marketing');"
);

// Дефолтный view
app = app.replace(
  "if (hasPermission('view_reports')) return 'reports';\n    if (hasPermission('view_monitoring')) return 'monitoring';",
  "if (hasPermission('view_reports')) return 'reports';\n    if (hasPermission('view_marketing')) return 'marketing';\n    if (hasPermission('view_monitoring')) return 'monitoring';"
);

// Чиним сломанный участок меню, если предыдущий патч оставил вложенный JSX
const brokenStart = "            {hasPermission('view_reports') && (\n              {hasPermission('view_marketing') && (";
const managementMarker = "              {hasPermission('view_management') && (";

if (app.includes(brokenStart)) {
  const start = app.indexOf(brokenStart);
  const end = app.indexOf(managementMarker, start);

  if (start === -1 || end === -1) {
    throw new Error('Не найден конец сломанного блока меню marketing/monitoring');
  }

  const replacement = `            {hasPermission('view_marketing') && (
              <button
                onClick={() => setActiveView('marketing')}
                className={\`flex items-center \${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer \${
                  activeView === 'marketing'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }\`}
                title={isSidebarExpanded ? "" : "Маркетинг"}
              >
                <Target className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Маркетинг
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Маркетинг
                  </span>
                )}
              </button>
            )}

              {/* SIDEBAR_MONITORING */}
              {hasPermission('view_monitoring') && (
                <button
                  onClick={() => setActiveView('monitoring')}
                  className={\`flex items-center \${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer \${
                    activeView === 'monitoring'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }\`}
                  title={isSidebarExpanded ? "" : "Мониторинг"}
                >
                  <Activity className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Мониторинг
                    </span>
                  )}
                  {!isSidebarExpanded && (
                    <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                      Мониторинг
                    </span>
                  )}
                </button>
              )}

`;

  app = app.slice(0, start) + replacement + app.slice(end);
} else {
  // Если блок не сломан, просто гарантируем правильные проверки.
  app = app.replace(
    "{hasPermission('view_reports') && (\n              <button\n                onClick={() => setActiveView('marketing')}",
    "{hasPermission('view_marketing') && (\n              <button\n                onClick={() => setActiveView('marketing')}"
  );

  app = app.replace(
    "{hasPermission('view_reports') && (\n                <button\n                  onClick={() => setActiveView('monitoring')}",
    "{hasPermission('view_monitoring') && (\n                <button\n                  onClick={() => setActiveView('monitoring')}"
  );
}

// Закрываем рендер вкладок правами
app = app.replace(
  "{activeView === 'marketing' && <MarketingTab />}",
  "{activeView === 'marketing' && hasPermission('view_marketing') && <MarketingTab />}"
);

app = app.replace(
  "{activeView === 'monitoring' && renderMonitoringView()}",
  "{activeView === 'monitoring' && hasPermission('view_monitoring') && renderMonitoringView()}"
);

write(files.app, app);

// ----------------------------------------------------
// 6. server.ts — backend права маркетинга
// ----------------------------------------------------
let server = read(files.server);

// default access roles: добавляем marketing admin, если еще нет
if (!server.includes("view_marketing: true")) {
  server = server.replace(
    "        view_reports: true,\n        listen_recordings: true,",
    "        view_reports: true,\n        view_marketing: true,\n        manage_marketing: true,\n        manage_calltracking: true,\n        manage_yandex_metrika: true,\n        manage_yandex_direct: true,\n        listen_recordings: true,"
  );
}

// В диапазоне marketing/calltracking endpoints меняем проверку view_reports -> view_marketing
const startMarker = "app.get('/api/calltracking/sites'";
const endMarker = "app.get('/api/roles'";
const start = server.indexOf(startMarker);
const end = server.indexOf(endMarker);

if (start !== -1 && end !== -1 && end > start) {
  const before = server.slice(0, start);
  let middle = server.slice(start, end);
  const after = server.slice(end);

  middle = replaceAll(middle, "checkUserPermission(req, 'view_reports')", "checkUserPermission(req, 'view_marketing')");
  middle = replaceAll(middle, "Access denied: view_reports permission required", "Access denied: view_marketing permission required");

  server = before + middle + after;
}

write(files.server, server);

console.log('OK: маркетинг добавлен в матрицу прав, меню и backend переведены на view_marketing.');
