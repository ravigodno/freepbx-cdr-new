const fs = require('fs');
const path = require('path');

const uiPath = path.join(process.cwd(), 'src/components/AIPBXAdminTab.tsx');
const serverPath = path.join(process.cwd(), 'server/aiPbxAdmin.ts');

for (const file of [uiPath, serverPath]) {
  if (!fs.existsSync(file)) {
    console.error('Не найден файл:', file);
    process.exit(1);
  }

  const bak = file + '.bak-settings-save-hard';
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
    console.log('Backup создан:', bak);
  }
}

let ui = fs.readFileSync(uiPath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

/**
 * FRONT: заменить handleSaveSettings любым способом между маркерами.
 */
const start = ui.indexOf('  // Save Settings');
const end = ui.indexOf('  // Test Connection', start);

if (start === -1 || end === -1) {
  console.error('Не нашел блок Save Settings / Test Connection во фронте.');
  process.exit(1);
}

const newSaveBlock = `  // Save Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setTestResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('/api/ai-pbx-admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          temperature: aiTemp,
          systemPrompt: aiSystemPrompt
        })
      });

      clearTimeout(timeout);

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (jsonError) {
        throw new Error('Сервер вернул не JSON: ' + text.slice(0, 300));
      }

      if (!res.ok) {
        throw new Error(data.error || \`HTTP \${res.status}\`);
      }

      setAiApiKey('');
      setAiApiKeyMasked(data.apiKeyMasked || '');
      setAiBaseUrl(data.baseUrl || aiBaseUrl);
      if (Array.isArray(data.modelCatalog)) {
        setAiAvailableModels(data.modelCatalog);
      }

      setTestResult({
        success: true,
        message: 'Настройки AI-администратора успешно сохранены.'
      });

      alert('Настройки AI-администратора успешно сохранены!');
    } catch (e: any) {
      clearTimeout(timeout);

      const message = e?.name === 'AbortError'
        ? 'Сохранение зависло больше 10 секунд. Проверьте pm2 logs asterisk-cdr-panel.'
        : 'Ошибка сохранения настроек: ' + (e?.message || 'неизвестная ошибка');

      console.error('[AIPBXAdmin] settings save failed:', e);
      setTestResult({
        success: false,
        message
      });

      alert(message);
    } finally {
      setIsSavingSettings(false);
    }
  };

`;

ui = ui.slice(0, start) + newSaveBlock + ui.slice(end);

/**
 * SERVER: добавить maskAiApiKey если вдруг нет.
 */
if (!server.includes('function maskAiApiKey')) {
  server = server.replace(
`// Helper to clean markdown block tags from JSON response`,
`function maskAiApiKey(key?: string): string {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length <= 8) return '********';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

// Helper to clean markdown block tags from JSON response`
  );
}

/**
 * SERVER: заменить GET settings на безопасный.
 */
server = server.replace(
/  \/\/ 16\. Get AIPBXAdmin Settings[\s\S]*?  \}\);\n\n  \/\/ 17\. Put AIPBXAdmin Settings/,
`  // 16. Get AIPBXAdmin Settings
  app.get('/api/ai-pbx-admin/settings', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        temperature: 0.4,
        systemPrompt: 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        baseUrl: '',
        modelCatalog: []
      };

      res.json({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-2.5-flash',
        temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
        systemPrompt: settings.systemPrompt || '',
        baseUrl: settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(settings.apiKey),
        modelCatalog: settings.modelCatalog || []
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] GET settings failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // 17. Put AIPBXAdmin Settings`
);

/**
 * SERVER: усилить PUT settings с логами и гарантированным JSON.
 */
server = server.replace(
/  \/\/ 17\. Put AIPBXAdmin Settings[\s\S]*?  \}\);\n\n  \/\/ 18\. Refresh provider model list/,
`  // 17. Put AIPBXAdmin Settings
  app.put('/api/ai-pbx-admin/settings', requireAuth, async (req: Request, res: Response) => {
    try {
      console.log('[AIPBXAdmin] PUT settings request received');

      const { provider, model, temperature, systemPrompt, apiKey, baseUrl } = req.body || {};
      const db = await readLocalDb();
      const previous = db.ai_pbx_settings || {};

      const nextSettings = {
        provider: provider || previous.provider || 'gemini',
        model: model || previous.model || 'gemini-2.5-flash',
        temperature: temperature !== undefined ? Number(temperature) : (previous.temperature !== undefined ? Number(previous.temperature) : 0.4),
        systemPrompt: systemPrompt || previous.systemPrompt || 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        apiKey: String(apiKey || '').trim() ? String(apiKey).trim() : previous.apiKey,
        baseUrl: String(baseUrl || '').trim(),
        modelCatalog: previous.modelCatalog || []
      };

      db.ai_pbx_settings = nextSettings;

      await writeLocalDb(db);

      console.log('[AIPBXAdmin] settings saved:', {
        provider: nextSettings.provider,
        model: nextSettings.model,
        hasApiKey: Boolean(nextSettings.apiKey),
        baseUrl: nextSettings.baseUrl || ''
      });

      res.json({
        success: true,
        provider: nextSettings.provider,
        model: nextSettings.model,
        temperature: nextSettings.temperature,
        systemPrompt: nextSettings.systemPrompt,
        baseUrl: nextSettings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(nextSettings.apiKey),
        modelCatalog: nextSettings.modelCatalog || []
      });
    } catch (error: any) {
      console.error('[AIPBXAdmin] PUT settings failed:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 18. Refresh provider model list`
);

fs.writeFileSync(uiPath, ui);
fs.writeFileSync(serverPath, server);

console.log('Готово: сохранение AI-настроек усилено, добавлены таймауты и серверные логи.');
