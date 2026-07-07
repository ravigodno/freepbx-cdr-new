const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';
const dbPath = 'data/db.json';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-message-normalizer';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Добавляем helper нормализации сообщений в backend
if (!s.includes('NORMALIZE_AIPBX_MESSAGE_V1')) {
  const marker = 'async function runStableLocalTrunksDiagnostic';
  if (!s.includes(marker)) {
    console.error('Не найден marker runStableLocalTrunksDiagnostic');
    process.exit(1);
  }

  const helper = `
// NORMALIZE_AIPBX_MESSAGE_V1
function normalizeAipbxMessage(m: any): any | null {
  if (!m || typeof m !== 'object') return null;

  const role = typeof m.role === 'string' ? m.role : '';
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null;

  const text = String(m.text || m.content || '');
  if (!text.trim()) return null;

  const createdAtRaw = m.createdAt || m.timestamp || m.created_at;
  const createdAt = createdAtRaw && !Number.isNaN(Date.parse(createdAtRaw))
    ? new Date(createdAtRaw).toISOString()
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

function normalizeAipbxMessages(messages: any): any[] {
  return Array.isArray(messages)
    ? messages.map(normalizeAipbxMessage).filter(Boolean)
    : [];
}

`;

  s = s.replace(marker, helper + marker);
}

// 2. Нормализуем userMsg: добавляем content/createdAt/timestamp
s = s.replace(
/const userMsg = \{\s*id: 'msg_' \+ crypto\.randomBytes\(6\)\.toString\('hex'\),\s*role: 'user',\s*text,\s*attachments: attachments \|\| \[\],\s*timestamp: new Date\(\)\.toISOString\(\)\s*\};/s,
`const nowIso = new Date().toISOString();
      const userMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'user',
        text,
        content: text,
        attachments: attachments || [],
        createdAt: nowIso,
        timestamp: nowIso
      };`
);

// 3. Нормализуем assistantMsg в стабильной локальной диагностике
s = s.replace(
/const assistantMsg = \{\s*id: 'msg_' \+ crypto\.randomBytes\(6\)\.toString\('hex'\),\s*role: 'assistant',\s*text: stableLocalAnswer,\s*timestamp: new Date\(\)\.toISOString\(\)\s*\};/s,
`const assistantNowIso = new Date().toISOString();
        const assistantMsg = {
          id: 'msg_' + crypto.randomBytes(6).toString('hex'),
          role: 'assistant',
          text: stableLocalAnswer,
          content: stableLocalAnswer,
          createdAt: assistantNowIso,
          timestamp: assistantNowIso,
          attachments: []
        };`
);

// 4. В локальном intercept заменяем фильтр messages на нормализатор
s = s.replace(
/session\.messages = Array\.isArray\(session\.messages\)\s*\?\s*session\.messages\.filter\(\(m: any\) => m && typeof m === 'object' && typeof m\.role === 'string'\)\s*:\s*\[\];/g,
`session.messages = normalizeAipbxMessages(session.messages);`
);

// 5. Перед ответом всегда возвращаем нормализованную session.messages
s = s.replace(
/return res\.json\(\{\s*success: true,\s*message: assistantMsg,\s*session\s*\}\);/g,
`session.messages = normalizeAipbxMessages(session.messages);

        return res.json({
          success: true,
          message: normalizeAipbxMessage(assistantMsg),
          session
        });`
);

fs.writeFileSync(file, s);

// 6. Чистим/нормализуем уже сохраненную историю в data/db.json
if (fs.existsSync(dbPath)) {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  function normMsg(m) {
    if (!m || typeof m !== 'object') return null;
    const role = typeof m.role === 'string' ? m.role : '';
    if (!['user', 'assistant', 'system'].includes(role)) return null;

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

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj.messages)) {
      obj.messages = obj.messages.map(normMsg).filter(Boolean);
    }

    for (const key of Object.keys(obj)) {
      walk(obj[key]);
    }
  }

  walk(db);

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('data/db.json: сообщения нормализованы.');
}

console.log('OK: AI-chat messages normalized, role/date crash fixed.');
