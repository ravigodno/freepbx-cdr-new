const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-frontend-role-crash';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Добавляем универсальный нормализатор сообщений для фронта
if (!s.includes('SAFE_AIPBX_FRONTEND_MESSAGES_V1')) {
  const marker = 'export default function';
  const helper = `
// SAFE_AIPBX_FRONTEND_MESSAGES_V1
const safeAipbxMessages = (messages: any): any[] => {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((m: any) => m && typeof m === 'object')
    .map((m: any) => {
      const role = typeof m.role === 'string' ? m.role : '';

      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        return null;
      }

      const text = String(m.text || m.content || '');
      if (!text.trim()) return null;

      const rawDate = m.createdAt || m.timestamp || m.created_at;
      const parsed = rawDate ? Date.parse(rawDate) : NaN;
      const createdAt = Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();

      return {
        ...m,
        role,
        text,
        content: text,
        createdAt,
        timestamp: createdAt
      };
    })
    .filter(Boolean);
};

`;

  if (!s.includes(marker)) {
    console.error('Не найден marker export default function');
    process.exit(1);
  }

  s = s.replace(marker, helper + marker);
}

// 2. Чиним прямые map по messages
s = s.replace(
  /(\w+)\.messages\.map\(/g,
  'safeAipbxMessages($1.messages).map('
);

s = s.replace(
  /(\w+)\?\.messages\.map\(/g,
  'safeAipbxMessages($1?.messages).map('
);

s = s.replace(
  /\((\w+)\.messages \|\| \[\]\)\.map\(/g,
  'safeAipbxMessages($1.messages).map('
);

s = s.replace(
  /\((\w+)\?\.messages \|\| \[\]\)\.map\(/g,
  'safeAipbxMessages($1?.messages).map('
);

// 3. Чиним setSession / setActiveSession после ответа API: нормализуем messages
s = s.replace(
  /setCurrentSession\(data\.session\);/g,
  `setCurrentSession(data.session ? { ...data.session, messages: safeAipbxMessages(data.session.messages) } : data.session);`
);

s = s.replace(
  /setSelectedSession\(data\.session\);/g,
  `setSelectedSession(data.session ? { ...data.session, messages: safeAipbxMessages(data.session.messages) } : data.session);`
);

s = s.replace(
  /setActiveSession\(data\.session\);/g,
  `setActiveSession(data.session ? { ...data.session, messages: safeAipbxMessages(data.session.messages) } : data.session);`
);

// 4. Если есть ручное добавление message в массив — защищаем message
s = s.replace(
  /\[\.\.\.(\w+)\.messages,\s*data\.message\]/g,
  `[...safeAipbxMessages($1.messages), data.message].filter((m: any) => m && typeof m.role === 'string')`
);

fs.writeFileSync(file, s);

console.log('OK: frontend AI messages role/date guard added.');
