const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';
const dbPath = 'data/db.json';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-ai-tool-router';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Добавляем tool-router helpers
if (!s.includes('AIPBX_AI_TOOL_ROUTER_V1')) {
  const marker = 'async function generateAIResponse';

  if (!s.includes(marker)) {
    console.error('Не найден marker async function generateAIResponse');
    process.exit(1);
  }

  const helper = `
// AIPBX_AI_TOOL_ROUTER_V1
function extractJsonObjectFromText(raw: string): any | null {
  const text = String(raw || '').trim();

  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\\s*\`\`\`/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

function normalizeToolCommandId(id: string): string {
  return String(id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function getAipbxAllowedToolCommands() {
  return {
    sip_show_registry: {
      title: 'Chan SIP registry',
      cmd: 'asterisk',
      args: ['-rx', 'sip show registry'],
      description: 'Проверка SIP-регистраций провайдеров chan_sip'
    },
    sip_show_peers: {
      title: 'Chan SIP peers',
      cmd: 'asterisk',
      args: ['-rx', 'sip show peers'],
      description: 'Проверка состояния chan_sip peers и задержек'
    },
    sip_show_settings: {
      title: 'Chan SIP settings',
      cmd: 'asterisk',
      args: ['-rx', 'sip show settings'],
      description: 'Проверка общих настроек chan_sip, NAT, bind, externip/localnet'
    },
    pjsip_show_registrations: {
      title: 'PJSIP registrations',
      cmd: 'asterisk',
      args: ['-rx', 'pjsip show registrations'],
      description: 'Проверка PJSIP регистраций'
    },
    pjsip_show_endpoints: {
      title: 'PJSIP endpoints',
      cmd: 'asterisk',
      args: ['-rx', 'pjsip show endpoints'],
      description: 'Проверка PJSIP endpoints'
    },
    pjsip_show_contacts: {
      title: 'PJSIP contacts',
      cmd: 'asterisk',
      args: ['-rx', 'pjsip show contacts'],
      description: 'Проверка PJSIP contacts'
    },
    rtp_show_settings: {
      title: 'RTP settings',
      cmd: 'asterisk',
      args: ['-rx', 'rtp show settings'],
      description: 'Проверка RTP диапазона и настроек RTP'
    },
    queue_show: {
      title: 'Queues',
      cmd: 'asterisk',
      args: ['-rx', 'queue show'],
      description: 'Проверка очередей и агентов'
    },
    core_show_channels: {
      title: 'Active channels',
      cmd: 'asterisk',
      args: ['-rx', 'core show channels concise'],
      description: 'Проверка активных каналов/звонков'
    },
    manager_show_settings: {
      title: 'AMI settings',
      cmd: 'asterisk',
      args: ['-rx', 'manager show settings'],
      description: 'Проверка AMI'
    }
  } as Record<string, { title: string; cmd: string; args: string[]; description: string }>;
}

async function executeAipbxToolCommands(requestedCommands: any[]): Promise<any[]> {
  const { execFile } = require('child_process');
  const allowed = getAipbxAllowedToolCommands();

  const commands = Array.isArray(requestedCommands) ? requestedCommands.slice(0, 8) : [];
  const results: any[] = [];

  const run = (title: string, cmd: string, args: string[]) => {
    return new Promise<any>((resolve) => {
      execFile(cmd, args, { timeout: 12000, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        resolve({
          title,
          command: [cmd, ...args].join(' '),
          ok: !error,
          stdout: String(stdout || '').slice(0, 20000),
          stderr: String(stderr || '').slice(0, 4000),
          error: error ? String(error.message || error).slice(0, 1200) : null
        });
      });
    });
  };

  for (const item of commands) {
    const id = normalizeToolCommandId(typeof item === 'string' ? item : item?.id);
    const spec = allowed[id];

    if (spec) {
      results.push(await run(spec.title, spec.cmd, spec.args));
      continue;
    }

    // Разрешенный параметризованный tool: sip show peer <peer>
    if (id === 'sip_show_peer') {
      const peer = String(item?.peer || item?.name || '').trim();

      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(peer)) {
        results.push({
          title: 'sip show peer',
          command: 'asterisk -rx "sip show peer <invalid>"',
          ok: false,
          stdout: '',
          stderr: '',
          error: 'Недопустимое имя peer. Разрешены только буквы, цифры, точка, дефис и подчеркивание.'
        });
        continue;
      }

      results.push(await run('Chan SIP peer ' + peer, 'asterisk', ['-rx', 'sip show peer ' + peer]));
      continue;
    }

    // Разрешенный параметризованный tool: pjsip show endpoint <endpoint>
    if (id === 'pjsip_show_endpoint') {
      const endpoint = String(item?.endpoint || item?.name || '').trim();

      if (!/^[A-Za-z0-9_.-]{1,80}$/.test(endpoint)) {
        results.push({
          title: 'pjsip show endpoint',
          command: 'asterisk -rx "pjsip show endpoint <invalid>"',
          ok: false,
          stdout: '',
          stderr: '',
          error: 'Недопустимое имя endpoint.'
        });
        continue;
      }

      results.push(await run('PJSIP endpoint ' + endpoint, 'asterisk', ['-rx', 'pjsip show endpoint ' + endpoint]));
      continue;
    }

    results.push({
      title: 'Rejected tool',
      command: id || '<empty>',
      ok: false,
      stdout: '',
      stderr: '',
      error: 'Команда не входит в whitelist безопасных read-only инструментов.'
    });
  }

  return results;
}

function buildAipbxToolRouterPrompt(userText: string, allowed: any): string {
  const tools = Object.entries(allowed).map(([id, spec]: any) => {
    return '- ' + id + ': ' + spec.description;
  }).join('\\n');

  return \`
Ты — AI tool-router для PBXPuls / FreePBX / Asterisk.

Твоя задача: по запросу пользователя выбрать, какие безопасные read-only диагностические команды надо выполнить.

ВАЖНО:
- Не отвечай пользователю обычным текстом.
- Верни только JSON.
- Не выдумывай команды.
- Используй только whitelist.
- Если нужно проверить конкретный chan_sip peer, можно использовать:
  {"id":"sip_show_peer","peer":"ИМЯ_PEER"}
- Если нужно проверить конкретный PJSIP endpoint, можно использовать:
  {"id":"pjsip_show_endpoint","endpoint":"ИМЯ_ENDPOINT"}
- Опасные действия, изменения конфигурации, restart/reload/delete запрещены.

Whitelist:
\${tools}

Запрос пользователя:
\${userText}

Верни JSON строго такого вида:
{
  "mode": "diagnose",
  "reason": "почему выбраны эти команды",
  "commands": [
    {"id":"sip_show_registry"},
    {"id":"sip_show_peers"}
  ]
}

Если диагностические команды не нужны:
{
  "mode": "answer",
  "reason": "почему команды не нужны",
  "commands": []
}
\`;
}

function formatToolResultsForAI(results: any[]): string {
  return results.map((r) => {
    return [
      '### ' + r.title,
      '$ ' + r.command,
      'OK: ' + r.ok,
      r.error ? 'ERROR: ' + r.error : '',
      r.stderr ? 'STDERR:\\n' + r.stderr : '',
      'STDOUT:\\n' + (r.stdout || 'пусто')
    ].filter(Boolean).join('\\n');
  }).join('\\n\\n---\\n\\n');
}

`;

  s = s.replace(marker, helper + marker);
}

// 2. Полностью заменяем route отправки сообщений на tool-router route
const startMarker = "  app.post('/api/ai-pbx-admin/sessions/:id/messages'";
const start = s.indexOf(startMarker);
const end = s.indexOf('\n  // 7.', start);

if (start === -1 || end === -1) {
  console.error('Не найден route messages или маркер // 7.');
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

      const settings = db.ai_pbx_settings || {};
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

      session.messages = normalizeAipbxMessagesFinal
        ? normalizeAipbxMessagesFinal(session.messages)
        : (Array.isArray(session.messages) ? session.messages : []);

      session.messages.push(userMsg);

      const allowed = getAipbxAllowedToolCommands();

      let plannerRaw = '';
      let plan: any = null;
      let toolResults: any[] = [];
      let finalText = '';

      try {
        plannerRaw = await generateAIResponse({
          provider: settings.provider || 'openai',
          model: settings.model || 'gpt-4o-mini',
          temperature: 0,
          systemPrompt: 'Ты возвращаешь только валидный JSON. Никакого markdown.',
          messages: [
            {
              role: 'user',
              text: buildAipbxToolRouterPrompt(text, allowed)
            }
          ],
          apiKey: settings.apiKey || '',
          baseUrl: settings.baseUrl || ''
        });

        plan = extractJsonObjectFromText(plannerRaw);

        if (!plan || !Array.isArray(plan.commands)) {
          plan = {
            mode: 'answer',
            reason: 'AI не вернул корректный JSON-план команд.',
            commands: []
          };
        }

        if (plan.mode === 'diagnose' && plan.commands.length > 0) {
          toolResults = await executeAipbxToolCommands(plan.commands);

          const toolOutput = formatToolResultsForAI(toolResults);

          const articles = Array.isArray(db.ai_pbx_knowledge) ? db.ai_pbx_knowledge : [];
          const kbContext = articles.length > 0
            ? '\\n\\nБаза знаний PBXPuls:\\n' + articles.map((art: any) => {
                return '[Тема: ' + String(art.title || '') + '\\nКатегория: ' + String(art.category || '') + '\\nСодержание: ' + String(art.content || '') + ']';
              }).join('\\n\\n')
            : '';

          const finalPrompt = \`
Пользователь спросил:
\${text}

AI выбрал диагностические команды:
\${JSON.stringify(plan, null, 2)}

Backend выполнил только разрешенные read-only команды из whitelist.
Ниже вывод команд:

\${toolOutput}

\${kbContext}

Сформируй инженерный ответ на русском:
1. Краткий вывод.
2. Что проверено.
3. Что найдено.
4. Что это значит.
5. Какие следующие безопасные шаги.
6. Если нужны опасные действия или изменения конфигурации — только предложи и попроси подтверждение.
Не выдумывай данные, которых нет в выводе команд.
\`;

          finalText = await generateAIResponse({
            provider: settings.provider || 'openai',
            model: settings.model || 'gpt-4o-mini',
            temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.2,
            systemPrompt: settings.systemPrompt || 'Ты — AIPBXAdmin, инженер FreePBX/Asterisk. Отвечай кратко и по делу.',
            messages: [
              { role: 'user', text: finalPrompt }
            ],
            apiKey: settings.apiKey || '',
            baseUrl: settings.baseUrl || ''
          });
        } else {
          const formattedMessages = session.messages.map((m: any) => ({
            role: m.role,
            text: m.text || m.content || ''
          }));

          finalText = await generateAIResponse({
            provider: settings.provider || 'openai',
            model: settings.model || 'gpt-4o-mini',
            temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.2,
            systemPrompt: settings.systemPrompt || 'Ты — AIPBXAdmin, инженер FreePBX/Asterisk. Отвечай кратко и по делу.',
            messages: formattedMessages,
            apiKey: settings.apiKey || '',
            baseUrl: settings.baseUrl || ''
          });
        }
      } catch (aiErr: any) {
        finalText = 'AI tool-router не смог выполнить задачу: ' + (aiErr?.message || String(aiErr)) + '\\n\\nПричина чаще всего: AI API недоступен с этой АТС или не настроен Base URL/proxy. Архитектурно команда должна выбираться AI, затем backend выполняет только whitelist-команды.';
      }

      const assistantIso = new Date().toISOString();

      const assistantMsg = {
        id: 'msg_' + crypto.randomBytes(6).toString('hex'),
        role: 'assistant',
        text: finalText,
        content: finalText,
        attachments: [],
        createdAt: assistantIso,
        timestamp: assistantIso,
        toolPlan: plan,
        toolResults: toolResults.map((r: any) => ({
          title: r.title,
          command: r.command,
          ok: r.ok,
          error: r.error || null
        }))
      };

      session.messages.push(assistantMsg);
      session.updatedAt = assistantIso;

      if (typeof normalizeAipbxMessagesFinal === 'function') {
        session.messages = normalizeAipbxMessagesFinal(session.messages);
      }

      await writeLocalDb(db);

      return res.json({
        success: true,
        message: assistantMsg,
        session
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] AI tool-router message route failed:', error);
      return res.status(500).json({
        success: false,
        error: error?.message || String(error)
      });
    }
  });

`;

s = s.slice(0, start) + newRoute + s.slice(end);

fs.writeFileSync(file, s);

// 3. System Instructions под tool-router
if (fs.existsSync(dbPath)) {
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  db.ai_pbx_settings = {
    ...(db.ai_pbx_settings || {}),
    temperature: 0.2,
    systemPrompt: `Ты — AIPBXAdmin, инженерный AI-администратор PBXPuls / FreePBX / Asterisk.

Ты не справочник. Ты работаешь по схеме:
1. Понимаешь задачу пользователя.
2. Если нужны данные с АТС — выбираешь диагностические команды через tool-router.
3. Backend выполняет только безопасные read-only команды из whitelist.
4. Ты анализируешь вывод команд и даешь инженерный вывод.

Правила:
- Не предлагай пользователю выполнить команду, если команда уже была выполнена backend.
- Не выдумывай вывод команд.
- Разделяй внешний транк, внутренний extension, endpoint, регистрацию провайдера, RTP, NAT, очередь.
- Опасные действия требуют явного подтверждения: restart, reload, изменение конфигов, удаление объектов, firewall.
- Отвечай на русском, кратко и по делу.`
  };

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('System Instructions обновлены под AI tool-router.');
}

console.log('OK: AI tool-router установлен.');
