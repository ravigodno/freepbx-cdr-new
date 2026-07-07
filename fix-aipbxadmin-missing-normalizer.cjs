const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-missing-normalizer';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('function normalizeAipbxMessageFinal')) {
  const marker = '// AIPBX_AI_TOOL_ROUTER_V1';

  if (!s.includes(marker)) {
    console.error('Не найден marker AIPBX_AI_TOOL_ROUTER_V1');
    process.exit(1);
  }

  const helper = `
// AIPBX_MESSAGE_NORMALIZER_RESTORED_V1
function normalizeAipbxMessageFinal(m: any): any | null {
  if (!m || typeof m !== 'object') return null;

  const role = typeof m.role === 'string' ? m.role : '';
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;

  const text = String(m.text || m.content || '');
  if (!text.trim()) return null;

  const rawDate = m.createdAt || m.timestamp || m.created_at;
  const createdAt = rawDate && !Number.isNaN(Date.parse(rawDate))
    ? new Date(rawDate).toISOString()
    : new Date().toISOString();

  return {
    id: String(m.id || ('msg_' + Date.now() + '_' + Math.random().toString(16).slice(2))),
    role,
    text,
    content: text,
    createdAt,
    timestamp: createdAt,
    attachments: Array.isArray(m.attachments) ? m.attachments : []
  };
}

function normalizeAipbxMessagesFinal(messages: any): any[] {
  return Array.isArray(messages)
    ? messages.map(normalizeAipbxMessageFinal).filter(Boolean)
    : [];
}

`;

  s = s.replace(marker, helper + marker);
  console.log('Нормализатор сообщений восстановлен.');
} else {
  console.log('Нормализатор уже есть.');
}

// На всякий случай чиним небезопасную проверку, если она осталась
s = s.replace(
  /session\.messages = normalizeAipbxMessagesFinal\s*\?\s*normalizeAipbxMessagesFinal\(session\.messages\)\s*:\s*\(Array\.isArray\(session\.messages\) \? session\.messages : \[\]\);/g,
  `session.messages = normalizeAipbxMessagesFinal(session.messages);`
);

fs.writeFileSync(file, s);

console.log('OK: normalizeAipbxMessagesFinal restored.');
