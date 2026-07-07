const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/components/AIPBXAdminTab.tsx');

if (!fs.existsSync(filePath)) {
  console.error('Не найден файл:', filePath);
  process.exit(1);
}

const bak = filePath + '.bak-auth-headers';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(filePath, 'utf8'));
  console.log('Backup создан:', bak);
}

let code = fs.readFileSync(filePath, 'utf8');

/**
 * 1. Добавляем helper авторизации внутри компонента.
 */
if (!code.includes('const authHeaders =')) {
  code = code.replace(
`  const messagesEndRef = useRef<HTMLDivElement>(null);`,
`  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = (extra: Record<string, string> = {}) => ({
    ...(userSession?.token ? { Authorization: \`Bearer \${userSession.token}\` } : {}),
    ...extra
  });`
  );
}

/**
 * 2. GET-запросы без headers.
 */
code = code.replace(
`fetch('/api/ai-pbx-admin/sessions')`,
`fetch('/api/ai-pbx-admin/sessions', { headers: authHeaders() })`
);

code = code.replace(
`fetch('/api/ai-pbx-admin/knowledge')`,
`fetch('/api/ai-pbx-admin/knowledge', { headers: authHeaders() })`
);

code = code.replace(
`fetch('/api/ai-pbx-admin/settings')`,
`fetch('/api/ai-pbx-admin/settings', { headers: authHeaders() })`
);

/**
 * 3. Все JSON-запросы переводим на authHeaders.
 */
code = code.replaceAll(
`headers: { 'Content-Type': 'application/json' },`,
`headers: authHeaders({ 'Content-Type': 'application/json' }),`
);

/**
 * 4. POST/DELETE без headers.
 */
code = code.replace(
`      const res = await fetch(\`/api/ai-pbx-admin/knowledge/from-session/\${sessId}\`, {
        method: 'POST'
      });`,
`      const res = await fetch(\`/api/ai-pbx-admin/knowledge/from-session/\${sessId}\`, {
        method: 'POST',
        headers: authHeaders()
      });`
);

code = code.replace(
`      const res = await fetch(\`/api/ai-pbx-admin/sessions/\${id}\`, {
        method: 'DELETE'
      });`,
`      const res = await fetch(\`/api/ai-pbx-admin/sessions/\${id}\`, {
        method: 'DELETE',
        headers: authHeaders()
      });`
);

/**
 * 5. На всякий случай исправляем возможные двойные замены.
 */
code = code.replaceAll(
`fetch('/api/ai-pbx-admin/settings', { headers: authHeaders() }, {`,
`fetch('/api/ai-pbx-admin/settings', {`
);

fs.writeFileSync(filePath, code);

console.log('Готово: во все запросы AI-администратора добавлен Authorization header.');
