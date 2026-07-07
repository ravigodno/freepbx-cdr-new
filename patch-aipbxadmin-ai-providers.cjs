const fs = require('fs');
const path = require('path');

const root = process.cwd();
const serverPath = path.join(root, 'server', 'aiPbxAdmin.ts');
const uiPath = path.join(root, 'src', 'components', 'AIPBXAdminTab.tsx');

for (const p of [serverPath, uiPath]) {
  if (!fs.existsSync(p)) {
    console.error('Не найден файл:', p);
    process.exit(1);
  }
}

function backup(file) {
  const bak = file + '.bak-ai-providers';
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
    console.log('Backup создан:', bak);
  }
}

backup(serverPath);
backup(uiPath);

let server = fs.readFileSync(serverPath, 'utf8');
let ui = fs.readFileSync(uiPath, 'utf8');

/**
 * SERVER PATCH
 */

// 1. Расширяем параметры generateAIResponse.
server = server.replace(
`async function generateAIResponse(params: {
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant', text: string }>;
  responseType?: 'json' | 'text';
}): Promise<string> {
  const { provider, model, temperature, systemPrompt, messages, responseType = 'text' } = params;`,
`async function generateAIResponse(params: {
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant', text: string }>;
  responseType?: 'json' | 'text';
  apiKey?: string;
  baseUrl?: string;
}): Promise<string> {
  const { provider, model, temperature, systemPrompt, messages, responseType = 'text', apiKey, baseUrl } = params;`
);

// 2. Добавляем helpers для маски и OpenAI-compatible URL.
if (!server.includes('function maskAiApiKey')) {
  server = server.replace(
`// Helper to clean markdown block tags from JSON response
function cleanJsonResponseText(raw: string): string {`,
`function maskAiApiKey(key?: string): string {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length <= 8) return '********';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

function normalizeAiBaseUrl(rawUrl?: string, fallback?: string): string {
  const source = String(rawUrl || fallback || '').trim();
  if (!source) return '';
  const normalized = source.replace(/\\/+$/, '');
  if (/\\/chat\\/completions$/i.test(normalized)) return normalized;
  if (/\\/v1$/i.test(normalized)) return normalized + '/chat/completions';
  return normalized + '/v1/chat/completions';
}

// Helper to clean markdown block tags from JSON response
function cleanJsonResponseText(raw: string): string {`
  );
}

// 3. Gemini key: settings.apiKey -> env.
server = server.replace(
`    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Укажите GEMINI_API_KEY в настройках (Secrets) вашего приложения в AI Studio.');
    }`,
`    const key = String(apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ Gemini в настройках AI-администратора или переменную GEMINI_API_KEY в .env.');
    }`
);

// 4. OpenAI key/baseUrl.
server = server.replace(
`    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('Укажите OPENAI_API_KEY в настройках (Secrets) вашего приложения в AI Studio.');
    }`,
`    const key = String(apiKey || process.env.OPENAI_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ OpenAI в настройках AI-администратора или переменную OPENAI_API_KEY в .env.');
    }
    const endpoint = normalizeAiBaseUrl(baseUrl, 'https://api.openai.com/v1');`
);

server = server.replace(
`    const res = await fetch('https://api.openai.com/v1/chat/completions', {`,
`    const res = await fetch(endpoint, {`
);

// 5. Anthropic key.
server = server.replace(
`    const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!key) {
      throw new Error('Укажите ANTHROPIC_API_KEY в настройках (Secrets) вашего приложения в AI Studio.');
    }`,
`    const key = String(apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ Anthropic/Claude в настройках AI-администратора или переменную ANTHROPIC_API_KEY в .env.');
    }
    const endpoint = String(baseUrl || 'https://api.anthropic.com/v1/messages').trim();`
);

server = server.replace(
`    const res = await fetch('https://api.anthropic.com/v1/messages', {`,
`    const res = await fetch(endpoint, {`
);

// 6. DeepSeek key/baseUrl.
server = server.replace(
`    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
      throw new Error('Укажите DEEPSEEK_API_KEY в настройках (Secrets) вашего приложения в AI Studio.');
    }`,
`    const key = String(apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ DeepSeek в настройках AI-администратора или переменную DEEPSEEK_API_KEY в .env.');
    }
    const endpoint = normalizeAiBaseUrl(baseUrl, 'https://api.deepseek.com');`
);

server = server.replace(
`    const res = await fetch('https://api.deepseek.com/chat/completions', {`,
`    const res = await fetch(endpoint, {`
);

// 7. Добавляем custom OpenAI-compatible provider перед unknown provider.
if (!server.includes("provider === 'custom'")) {
  server = server.replace(
`  throw new Error(\`Неизвестный провайдер: \${provider}\`);
}`,
`  // 5. Any OpenAI-compatible provider
  if (provider === 'custom' || provider === 'openai_compatible') {
    const key = String(apiKey || '').trim();
    const endpoint = normalizeAiBaseUrl(baseUrl);
    if (!endpoint) {
      throw new Error('Укажите Base URL для OpenAI-compatible провайдера.');
    }
    if (!key) {
      throw new Error('Укажите API-ключ для OpenAI-compatible провайдера.');
    }

    const payload = {
      model: model || 'gpt-4o-mini',
      temperature: Number(temperature),
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text
        }))
      ],
      ...(responseType === 'json' ? { response_format: { type: 'json_object' } } : {})
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${key}\`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(\`OpenAI-compatible API error (\${res.status}): \${errText}\`);
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  throw new Error(\`Неизвестный провайдер: \${provider}\`);
}`
  );
}

// 8. Во всех generateAIResponse вызовах добавляем apiKey/baseUrl из settings.
server = server.replace(
`          provider: settings.provider || 'gemini',
          model: settings.model || 'gemini-3.5-flash',
          temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
          systemPrompt: finalSystemInstruction,
          messages: formattedMessages`,
`          provider: settings.provider || 'gemini',
          model: settings.model || 'gemini-3.5-flash',
          temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
          systemPrompt: finalSystemInstruction,
          messages: formattedMessages,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl`
);

server = server.replace(
`          provider: settings.provider || 'gemini',
          model: settings.model || 'gemini-3.5-flash',
          temperature: 0.1,
          systemPrompt: 'You are an Asterisk diagnostic assistant. Return raw JSON arrays only.',
          messages: [{ role: 'user', text: prompt }],
          responseType: 'json'`,
`          provider: settings.provider || 'gemini',
          model: settings.model || 'gemini-3.5-flash',
          temperature: 0.1,
          systemPrompt: 'You are an Asterisk diagnostic assistant. Return raw JSON arrays only.',
          messages: [{ role: 'user', text: prompt }],
          responseType: 'json',
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl`
);

server = server.replace(
`        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.2,
        systemPrompt: 'You are an expert Asterisk, FreePBX, and Linux system logging analyzer.',
        messages: [{ role: 'user', text: prompt }]`,
`        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.2,
        systemPrompt: 'You are an expert Asterisk, FreePBX, and Linux system logging analyzer.',
        messages: [{ role: 'user', text: prompt }],
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl`
);

// Может быть еще генерация KB/мастера — добавим безопасно в оставшиеся блоки, где есть generateAIResponse без apiKey.
server = server.replace(
/(messages: \\[\\{ role: 'user', text: prompt \\}\\]\\n\\s*\\})/g,
`messages: [{ role: 'user', text: prompt }],
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl
      }`
);

// 9. GET settings: не отдавать raw apiKey.
if (!server.includes("apiKeyMasked: maskAiApiKey(settings.apiKey)")) {
  server = server.replace(
`      res.json(db.ai_pbx_settings || {`,
`      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4,
        systemPrompt: 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        baseUrl: ''
      };

      res.json({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: settings.temperature !== undefined ? Number(settings.temperature) : 0.4,
        systemPrompt: settings.systemPrompt || '',
        baseUrl: settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(settings.apiKey)
      });
      return;

      res.json(db.ai_pbx_settings || {`
  );
}

// 10. PUT settings: сохранять apiKey/baseUrl, но не перетирать ключ если поле пустое.
server = server.replace(
`      const { provider, model, temperature, systemPrompt } = req.body;
      const db = await readLocalDb();
      
      db.ai_pbx_settings = {
        provider: provider || 'gemini',
        model: model || 'gemini-3.5-flash',
        temperature: temperature !== undefined ? Number(temperature) : 0.4,
        systemPrompt: systemPrompt || 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.'
      };

      await writeLocalDb(db);
      res.json(db.ai_pbx_settings);`,
`      const { provider, model, temperature, systemPrompt, apiKey, baseUrl } = req.body;
      const db = await readLocalDb();
      const previous = db.ai_pbx_settings || {};

      db.ai_pbx_settings = {
        provider: provider || 'gemini',
        model: model || 'gemini-3.5-flash',
        temperature: temperature !== undefined ? Number(temperature) : 0.4,
        systemPrompt: systemPrompt || 'You are AIPBXAdmin, a world-class senior Asterisk, FreePBX, PJSIP, dialplan, and Linux networking support specialist. Help users troubleshoot FreePBX issues step-by-step. Provide clean markdown format with bullet points, code blocks for terminal commands or configurations, and exact explanations. Always write your response in Russian.',
        apiKey: String(apiKey || '').trim() ? String(apiKey).trim() : previous.apiKey,
        baseUrl: String(baseUrl || '').trim()
      };

      await writeLocalDb(db);
      res.json({
        provider: db.ai_pbx_settings.provider,
        model: db.ai_pbx_settings.model,
        temperature: db.ai_pbx_settings.temperature,
        systemPrompt: db.ai_pbx_settings.systemPrompt,
        baseUrl: db.ai_pbx_settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(db.ai_pbx_settings.apiKey)
      });`
);

// 11. Test provider: принимать текущие поля из UI, не требовать предварительного сохранения.
server = server.replace(
`      const db = await readLocalDb();
      const settings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4
      };

      const testResult = await generateAIResponse({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.1,
        systemPrompt: 'Say exactly: Connection OK',
        messages: [{ role: 'user', text: 'Respond with exactly "Connection OK"' }]
      });`,
`      const db = await readLocalDb();
      const savedSettings = db.ai_pbx_settings || {
        provider: 'gemini',
        model: 'gemini-3.5-flash',
        temperature: 0.4
      };

      const settings = {
        ...savedSettings,
        ...req.body,
        apiKey: String(req.body?.apiKey || '').trim() ? String(req.body.apiKey).trim() : savedSettings.apiKey
      };

      const testResult = await generateAIResponse({
        provider: settings.provider || 'gemini',
        model: settings.model || 'gemini-3.5-flash',
        temperature: 0.1,
        systemPrompt: 'Say exactly: Connection OK',
        messages: [{ role: 'user', text: 'Respond with exactly "Connection OK"' }],
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl
      });`
);

/**
 * UI PATCH
 */

// 1. Добавляем states.
if (!ui.includes('const [aiApiKey, setAiApiKey]')) {
  ui = ui.replace(
`  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiModel, setAiModel] = useState('gemini-3.5-flash');
  const [aiTemp, setAiTemp] = useState(0.4);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');`,
`  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiModel, setAiModel] = useState('gemini-3.5-flash');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiTemp, setAiTemp] = useState(0.4);
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');`
  );
}

// 2. fetchSettings.
ui = ui.replace(
`        setAiProvider(data.provider || 'gemini');
        setAiModel(data.model || 'gemini-3.5-flash');
        setAiTemp(data.temperature !== undefined ? data.temperature : 0.4);
        setAiSystemPrompt(data.systemPrompt);`,
`        setAiProvider(data.provider || 'gemini');
        setAiModel(data.model || 'gemini-3.5-flash');
        setAiApiKey('');
        setAiApiKeyMasked(data.apiKeyMasked || '');
        setAiBaseUrl(data.baseUrl || '');
        setAiTemp(data.temperature !== undefined ? data.temperature : 0.4);
        setAiSystemPrompt(data.systemPrompt || '');`
);

// 3. provider onChange add custom.
ui = ui.replace(
`                    else if (prov === 'deepseek') setAiModel('deepseek-chat');`,
`                    else if (prov === 'deepseek') setAiModel('deepseek-chat');
                    else if (prov === 'custom') setAiModel('gpt-4o-mini');`
);

// 4. Добавить custom option.
ui = ui.replace(
`                  <option value="deepseek">DeepSeek AI</option>`,
`                  <option value="deepseek">DeepSeek AI</option>
                  <option value="custom">OpenAI-compatible / свой сервер</option>`
);

// 5. Добавить custom models.
ui = ui.replace(
`                  {aiProvider === 'deepseek' && (
                    <>
                      <option value="deepseek-chat">DeepSeek Chat (быстрая, умная)</option>
                      <option value="deepseek-coder">DeepSeek Coder (техническая)</option>
                    </>
                  )}`,
`                  {aiProvider === 'deepseek' && (
                    <>
                      <option value="deepseek-chat">DeepSeek Chat (быстрая, умная)</option>
                      <option value="deepseek-coder">DeepSeek Coder (техническая)</option>
                    </>
                  )}
                  {aiProvider === 'custom' && (
                    <>
                      <option value="gpt-4o-mini">gpt-4o-mini / совместимая модель</option>
                      <option value="llama-3.1-70b">llama-3.1-70b</option>
                      <option value="qwen2.5-coder-32b">qwen2.5-coder-32b</option>
                      <option value="custom-model">custom-model</option>
                    </>
                  )}`
);

// 6. SaveSettings: отправлять apiKey/baseUrl.
ui = ui.replace(
`          provider: aiProvider,
          model: aiModel,
          temperature: aiTemp,
          systemPrompt: aiSystemPrompt`,
`          provider: aiProvider,
          model: aiModel,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          temperature: aiTemp,
          systemPrompt: aiSystemPrompt`
);

// 7. После сохранения обновлять маску и очищать поле ключа.
ui = ui.replace(
`      if (res.ok) {
        alert('Настройки AI-администратора успешно сохранены!');
      }`,
`      if (res.ok) {
        const data = await res.json();
        setAiApiKey('');
        setAiApiKeyMasked(data.apiKeyMasked || '');
        setAiBaseUrl(data.baseUrl || aiBaseUrl);
        alert('Настройки AI-администратора успешно сохранены!');
      }`
);

// 8. Test provider: отправлять текущие настройки.
ui = ui.replace(
`      const res = await fetch('/api/ai-pbx-admin/settings/test-provider', {
        method: 'POST'
      });`,
`      const res = await fetch('/api/ai-pbx-admin/settings/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          temperature: aiTemp,
          systemPrompt: aiSystemPrompt
        })
      });`
);

// 9. Provider label for test.
ui = ui.replace(
`Проверка подключения к {aiProvider === 'gemini' ? 'Gemini API' : aiProvider === 'openai' ? 'OpenAI API' : aiProvider === 'anthropic' ? 'Anthropic API' : 'DeepSeek API'}`,
`Проверка подключения к {aiProvider === 'gemini' ? 'Gemini API' : aiProvider === 'openai' ? 'OpenAI API' : aiProvider === 'anthropic' ? 'Anthropic API' : aiProvider === 'deepseek' ? 'DeepSeek API' : 'OpenAI-compatible API'}`
);

// 10. Вставляем поля API key/Base URL после provider/model grid.
if (!ui.includes('API-ключ провайдера')) {
  ui = ui.replace(
`            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">`,
`            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">API-ключ провайдера</label>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder={aiApiKeyMasked ? \`Ключ сохранен: \${aiApiKeyMasked}. Введите новый для замены.\` : 'Вставьте API-ключ'}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                  autoComplete="off"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Ключ хранится локально в PBXPuls. Если поле оставить пустым, сохраненный ключ не изменится.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">Base URL</label>
                <input
                  type="text"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder={
                    aiProvider === 'openai' ? 'https://api.openai.com/v1' :
                    aiProvider === 'anthropic' ? 'https://api.anthropic.com/v1/messages' :
                    aiProvider === 'deepseek' ? 'https://api.deepseek.com' :
                    aiProvider === 'gemini' ? 'Обычно не требуется' :
                    'https://ваш-сервер/v1'
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Для OpenAI-compatible укажите адрес своего шлюза или локальной LLM. Для стандартных провайдеров можно оставить пустым.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-[11px] leading-relaxed text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
              <div className="font-black mb-1">Поддерживаемая схема</div>
              <div>OpenAI / ChatGPT, Google Gemini, Anthropic Claude, DeepSeek и любой OpenAI-compatible API. Это позволяет подключить облачную модель, локальную LLM или корпоративный AI-шлюз.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">`
  );
}

fs.writeFileSync(serverPath, server);
fs.writeFileSync(uiPath, ui);

console.log('Готово: AI-администратор получил настройки API-ключа, Base URL и OpenAI-compatible провайдера.');
