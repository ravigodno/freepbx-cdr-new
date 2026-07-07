const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-trunks-ai-diagnostic';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (s.includes("/api/ai-pbx-admin/diagnostics/trunks-ai")) {
  console.log('Endpoint trunks-ai уже есть');
  process.exit(0);
}

const marker = "  // 16. Get AIPBXAdmin Settings";

if (!s.includes(marker)) {
  console.error('Не найден маркер для вставки endpoint:', marker);
  process.exit(1);
}

const endpoint = `
  // 15.1 AI trunk diagnostics
  app.post('/api/ai-pbx-admin/diagnostics/trunks-ai', aiPbxAuth, async (req: Request, res: Response) => {
    const { execFile } = require('child_process');

    const runCommand = (cmd: string, args: string[], timeoutMs = 8000) => {
      return new Promise<{ command: string; ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
        const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
          resolve({
            command: [cmd, ...args].join(' '),
            ok: !error,
            stdout: String(stdout || '').slice(0, 12000),
            stderr: String(stderr || '').slice(0, 4000),
            error: error ? String(error.message || error).slice(0, 1000) : undefined
          });
        });

        child.on('error', (error: any) => {
          resolve({
            command: [cmd, ...args].join(' '),
            ok: false,
            stdout: '',
            stderr: '',
            error: String(error.message || error).slice(0, 1000)
          });
        });
      });
    };

    try {
      const question = String(req.body?.question || 'Проверь, все ли SIP/PJSIP транки на связи').slice(0, 1000);

      const commands = [
        ['asterisk', ['-rx', 'pjsip show registrations']],
        ['asterisk', ['-rx', 'pjsip show endpoints']],
        ['asterisk', ['-rx', 'sip show registry']],
        ['asterisk', ['-rx', 'sip show peers']]
      ];

      const results = [];
      for (const [cmd, args] of commands) {
        results.push(await runCommand(cmd as string, args as string[]));
      }

      const db = await readLocalDb();
      const settings = db.ai_pbx_settings || {};

      const safeOutput = results.map((r: any) => {
        return [
          '### COMMAND: ' + r.command,
          'OK: ' + r.ok,
          r.error ? 'ERROR: ' + r.error : '',
          'STDOUT:',
          r.stdout || '',
          'STDERR:',
          r.stderr || ''
        ].join('\\n');
      }).join('\\n\\n---\\n\\n');

      const prompt = \`
Пользователь задал вопрос:
\${question}

Ниже вывод безопасных диагностических команд Asterisk/FreePBX.
Проанализируй транки и регистрации.

Требования к ответу:
1. Сначала короткий вывод: все ли транки на связи.
2. Затем список проблемных транков, если есть.
3. Объясни, что означают статусы Registered, Rejected, Timeout, Unreachable, NonQual, Offline.
4. Дай следующие команды для проверки только если они действительно нужны.
5. Не выдумывай. Если данных недостаточно — прямо скажи.

Вывод команд:
\${safeOutput}
\`;

      const aiText = await generateAIResponse({
        provider: settings.provider || 'openai',
        model: settings.model || 'gpt-4o-mini',
        apiKey: settings.apiKey || '',
        baseUrl: settings.baseUrl || '',
        temperature: 0.2,
        systemPrompt: settings.systemPrompt || 'Ты опытный инженер Asterisk/FreePBX. Отвечай на русском языке кратко и по делу.',
        messages: [
          { role: 'user', text: prompt }
        ]
      });

      res.json({
        success: true,
        question,
        commands: results.map((r: any) => ({
          command: r.command,
          ok: r.ok,
          error: r.error || null
        })),
        answer: aiText
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] trunks-ai failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || String(error)
      });
    }
  });

`;

s = s.replace(marker, endpoint + marker);

fs.writeFileSync(file, s);

console.log('OK: добавлен endpoint AI-диагностики транков.');
