const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';
const dbPath = 'data/db.json';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-message-route-final';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Убедимся, что нормализатор есть
if (!s.includes('NORMALIZE_AIPBX_MESSAGE_FINAL_V1')) {
  const marker = 'async function runStableLocalTrunksDiagnostic';
  if (!s.includes(marker)) {
    console.error('Не найден runStableLocalTrunksDiagnostic');
    process.exit(1);
  }

  const helper = `
// NORMALIZE_AIPBX_MESSAGE_FINAL_V1
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
}

// 2. Полностью заменяем route отправки сообщения
const startMarker = "  app.post('/api/ai-pbx-admin/sessions/:id/messages'";
const start = s.indexOf(startMarker);
const end = s.indexOf('\n  // 7.', start);

if (start === -1 || end === -1) {
  console.error('Не найден участок route sessions/:id/messages или маркер // 7.');
  console.log({ startFound: start !== -1, endFound: end !== -1 });
  process.exit(1);
}

const newRoute = `  app.post('/api/ai-pbx-admin/sessions/:id/messages', aiPbxAuth, async (req: Request, res: Response) => {
    try {
      const text = String(req.body?.text || '').trim();
      const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

      if (!text) {
        return res.status(400).json({ success: false, error: 'Message text is required' });
      }

      const db = await readLocalDb();
      db.ai_pbx_sessions = Array.isArray(db.ai_pbx_sessions) ? db.ai_pbx_sessions : [];

      const session = db.ai_pbx_sessions.find((s: any) => s && s.id === req.params.id);
      if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
      }

      session.messages = normalizeAipbxMessagesFinal(session.messages);

      const nowIso = new Date().toISOString();

      const userMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'user',
        text,
        content: text,
        attachments,
        createdAt: nowIso,
        timestamp: nowIso
      };

      // 1) Сначала пробуем локальную диагностику БЕЗ OpenAI
      const localAnswer = await runStableLocalTrunksDiagnostic(text);

      if (localAnswer) {
        const assistantIso = new Date().toISOString();

        const assistantMsg = {
          id: 'msg_' + crypto.randomBytes(6).toString('hex'),
          role: 'assistant',
          text: localAnswer,
          content: localAnswer,
          attachments: [],
          createdAt: assistantIso,
          timestamp: assistantIso
        };

        session.messages.push(userMsg);
        session.messages.push(assistantMsg);
        session.messages = normalizeAipbxMessagesFinal(session.messages);
        session.updatedAt = assistantIso;

        await writeLocalDb(db);

        return res.json({
          success: true,
          message: normalizeAipbxMessageFinal(assistantMsg),
          session: {
            ...session,
            messages: normalizeAipbxMessagesFinal(session.messages)
          }
        });
      }

      // 2) Если это не диагностический вопрос — обычный AI-ответ
      session.messages.push(userMsg);
      session.messages = normalizeAipbxMessagesFinal(session.messages);

      const settings = db.ai_pbx_settings || {};
      const articles = Array.isArray(db.ai_pbx_knowledge) ? db.ai_pbx_knowledge : [];

      const kbContext = articles.length > 0
        ? '\\nДоступные статьи Базы Знаний, которые могут помочь:\\n' + articles.map((art: any) => {
            return '[Тема: ' + String(art.title || '') + '\\nКатегория: ' + String(art.category || '') + '\\nСодержание: ' + String(art.content || '') + ']';
          }).join('\\n\\n')
        : '';

      const finalSystemInstruction = String(settings.systemPrompt || 'Ты — AIPBXAdmin, технический AI-администратор АТС PBXPuls. Отвечай на русском языке.') + kbContext;

      const formattedMessages = session.messages.map((m: any) => ({
        role: m.role,
        text: m.text || m.content || ''
      }));

      let aiText = '';

      try {
        aiText = await generateAIResponse({
          provider: settings.provider || 'openai',
          model: settings.model || 'gpt-4o-mini',
          temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
          systemPrompt: finalSystemInstruction,
          messages: formattedMessages,
          apiKey: settings.apiKey || '',
          baseUrl: settings.baseUrl || ''
        });
      } catch (aiErr: any) {
        aiText = 'AI-провайдер сейчас недоступен: ' + (aiErr?.message || String(aiErr)) + '\\n\\nДля локальной диагностики напишите, например: «Проверь, все ли транки на связи», «Проверь PJSIP», «Проверь очереди», «Проверь RTP».';
      }

      const assistantIso = new Date().toISOString();

      const assistantMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'assistant',
        text: aiText,
        content: aiText,
        attachments: [],
        createdAt: assistantIso,
        timestamp: assistantIso
      };

      session.messages.push(assistantMsg);
      session.messages = normalizeAipbxMessagesFinal(session.messages);
      session.updatedAt = assistantIso;

      await writeLocalDb(db);

      return res.json({
        success: true,
        message: normalizeAipbxMessageFinal(assistantMsg),
        session: {
          ...session,
          messages: normalizeAipbxMessagesFinal(session.messages)
        }
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] message route failed:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });

`;

s = s.slice(0, start) + newRoute + s.slice(end);

fs.writeFileSync(file, s);

// 3. Нормализуем уже сохраненную историю
if (fs.existsSync(dbPath)) {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  function norm(m) {
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
      obj.messages = obj.messages.map(norm).filter(Boolean);
    }

    for (const key of Object.keys(obj)) {
      walk(obj[key]);
    }
  }

  walk(db);

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('data/db.json нормализован.');
}

console.log('OK: message route полностью заменен на стабильный.');
