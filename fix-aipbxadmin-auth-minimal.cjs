const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-auth-minimal';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('const authHeaders =')) {
  s = s.replace(
`  const messagesEndRef = useRef<HTMLDivElement>(null);`,
`  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = (extra: Record<string, string> = {}) => {
    const token =
      userSession?.token ||
      localStorage.getItem('asterisk_cdr_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      '';

    return {
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...extra
    };
  };`
  );
}

s = s.replace(
`const res = await fetch('/api/ai-pbx-admin/sessions');`,
`const res = await fetch('/api/ai-pbx-admin/sessions', { headers: authHeaders() });`
);

s = s.replace(
`const res = await fetch('/api/ai-pbx-admin/knowledge');`,
`const res = await fetch('/api/ai-pbx-admin/knowledge', { headers: authHeaders() });`
);

s = s.replace(
`const res = await fetch('/api/ai-pbx-admin/settings');`,
`const res = await fetch('/api/ai-pbx-admin/settings', { headers: authHeaders() });`
);

s = s.replaceAll(
`headers: { 'Content-Type': 'application/json' },`,
`headers: authHeaders({ 'Content-Type': 'application/json' }),`
);

s = s.replace(
`const res = await fetch(\`/api/ai-pbx-admin/sessions/\${id}\`, {
        method: 'DELETE'
      });`,
`const res = await fetch(\`/api/ai-pbx-admin/sessions/\${id}\`, {
        method: 'DELETE',
        headers: authHeaders()
      });`
);

fs.writeFileSync(file, s);

console.log('Готово: добавлена авторизация в запросы AI-админа.');
