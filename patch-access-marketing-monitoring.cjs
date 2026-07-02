const fs = require('fs');

const files = {
  app: 'src/App.tsx',
  permissions: 'src/modules/access/permissions.ts',
  roleMatrix: 'src/modules/access/roleMatrix.ts',
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
// 1. permissions.ts — добавляем отдельные права маркетинга
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
// 2. roleMatrix.ts — admin получает маркетинг по умолчанию,
// manager не получает маркетинг по умолчанию
// ----------------------------------------------------

let roleMatrix = read(files.roleMatrix);

if (!roleMatrix.includes("'view_marketing'")) {
  roleMatrix = roleMatrix.replace(
    "    'view_reports',\n    'listen_recordings',",
    "    'view_reports',\n    'view_marketing',\n    'manage_marketing',\n    'manage_calltracking',\n    'manage_yandex_metrika',\n    'manage_yandex_direct',\n    'listen_recordings',"
  );
}

write(files.roleMatrix, roleMatrix);

// ----------------------------------------------------
// 3. App.tsx — маркетинг только по view_marketing,
// мониторинг только по view_monitoring
// ----------------------------------------------------

let app = read(files.app);

// Доступ к view
app = app.replace(
  "if (view === 'marketing') return hasPermission('view_reports');",
  "if (view === 'marketing') return hasPermission('view_marketing');"
);

// Дефолтная вкладка после логина
app = app.replace(
  "if (hasPermission('view_reports')) return 'reports';\n    if (hasPermission('view_monitoring')) return 'monitoring';",
  "if (hasPermission('view_reports')) return 'reports';\n    if (hasPermission('view_marketing')) return 'marketing';\n    if (hasPermission('view_monitoring')) return 'monitoring';"
);

// Пункт меню Маркетинг оборачиваем в проверку, если еще не обернут
const marketingStart = `              <button
                onClick={() => setActiveView('marketing')}`;

if (app.includes(marketingStart) && !app.includes("{hasPermission('view_marketing') && (\n              <button\n                onClick={() => setActiveView('marketing')}")) {
  app = app.replace(
    marketingStart,
    `              {hasPermission('view_marketing') && (
              <button
                onClick={() => setActiveView('marketing')}`
  );

  const monitoringStart = `              <button
                onClick={() => setActiveView('monitoring')}`;

  app = app.replace(
    monitoringStart,
    `              )}
              <button
                onClick={() => setActiveView('monitoring')}`
  );
}

// Пункт меню Мониторинг оборачиваем в проверку, если еще не обернут
const monitoringStart2 = `              <button
                onClick={() => setActiveView('monitoring')}`;

if (app.includes(monitoringStart2) && !app.includes("{hasPermission('view_monitoring') && (\n              <button\n                onClick={() => setActiveView('monitoring')}")) {
  app = app.replace(
    monitoringStart2,
    `              {hasPermission('view_monitoring') && (
              <button
                onClick={() => setActiveView('monitoring')}`
  );

  const managementStart = `              {hasPermission('view_management') && (`;

  app = app.replace(
    managementStart,
    `              )}
              {hasPermission('view_management') && (`
  );
}

// Рендер вкладок тоже закрываем правами
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
// 4. server.ts — добавляем маркетинговые права в default roles
// ----------------------------------------------------

let server = read(files.server);

if (!server.includes("view_marketing: true")) {
  // SU/admin defaults обычно лежат в getDefaultAccessRoles.
  // Добавляем маркетинговые права в ближайший блок admin permissions после view_reports.
  server = server.replace(
    "        view_reports: true,\n        listen_recordings: true,",
    "        view_reports: true,\n        view_marketing: true,\n        manage_marketing: true,\n        manage_calltracking: true,\n        manage_yandex_metrika: true,\n        manage_yandex_direct: true,\n        listen_recordings: true,"
  );
}

// Backend-защита маркетинга.
// Раньше marketing/calltracking часто сидели на view_reports.
// Для вкладки маркетинга правильнее требовать view_marketing.
// Делаем замену только в диапазоне marketing/calltracking routes.
const startMarker = "app.get('/api/calltracking/sites'";
const endMarker = "app.get('/api/roles'";
const start = server.indexOf(startMarker);
const end = server.indexOf(endMarker);

if (start !== -1 && end !== -1 && end > start) {
  const before = server.slice(0, start);
  let middle = server.slice(start, end);
  const after = server.slice(end);

  middle = replaceAll(
    middle,
    "checkUserPermission(req, 'view_reports')",
    "checkUserPermission(req, 'view_marketing')"
  );

  middle = replaceAll(
    middle,
    "Access denied: view_reports permission required",
    "Access denied: view_marketing permission required"
  );

  server = before + middle + after;
}

write(files.server, server);

console.log('Patch applied: marketing permissions added, menu and backend checks updated.');
