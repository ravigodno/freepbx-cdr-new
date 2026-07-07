const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server', 'aiPbxAdmin.ts');
const uiPath = path.join(process.cwd(), 'src', 'components', 'AIPBXAdminTab.tsx');

for (const file of [serverPath, uiPath]) {
  if (!fs.existsSync(file)) {
    console.error('Не найден файл:', file);
    process.exit(1);
  }
  const bak = file + '.bak-dynamic-models';
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
    console.log('Backup создан:', bak);
  }
}

let server = fs.readFileSync(serverPath, 'utf8');
let ui = fs.readFileSync(uiPath, 'utf8');

/**
 * SERVER
 * Добавляем универсальное получение списка моделей.
 */

if (!server.includes('function getDefaultAiModels')) {
  server = server.replace(
`function normalizeAiBaseUrl(rawUrl?: string, fallback?: string): string {`,
`function getDefaultAiModels(provider: string): string[] {
  if (provider === 'openai') {
    return [
      'gpt-5.5',
      'gpt-5.5-mini',
      'gpt-5.5-nano',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4o',
      'gpt-4o-mini'
    ];
  }

  if (provider === 'gemini') {
    return [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ];
  }

  if (provider === 'anthropic' || provider === 'claude') {
    return [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  if (provider === 'deepseek') {
    return [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-coder'
    ];
  }

  return [
    'gpt-4o-mini',
    'gpt-4o',
    'llama-3.1-70b',
    'qwen2.5-coder-32b',
    'custom-model'
  ];
}

function normalizeModelsEndpoint(rawUrl?: string, fallback?: string): string {
  const source = String(rawUrl || fallback || '').trim();
  if (!source) return '';
  let normalized = source.replace(/\\/+$/, '');
  normalized = normalized.replace(/\\/chat\\/completions$/i, '');
  normalized = normalized.replace(/\\/responses$/i, '');
  if (/\\/models$/i.test(normalized)) return normalized;
  if (/\\/v1$/i.test(normalized)) return normalized + '/models';
  return normalized + '/v1/models';
}

async function discoverAiModels(params: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ models: string[]; source: string; error?: string }> {
  const provider = String(params.provider || 'gemini').trim();
  const fallbackModels = getDefaultAiModels(provider);

  try {
    if (provider === 'openai') {
      const key = String(params.apiKey || process.env.OPENAI_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ OpenAI не указан' };

      const endpoint = normalizeModelsEndpoint(params.baseUrl, 'https://api.openai.com/v1');
      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`OpenAI models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'custom' || provider === 'openai_compatible') {
      const key = String(params.apiKey || '').trim();
      const endpoint = normalizeModelsEndpoint(params.baseUrl);
      if (!endpoint) return { models: fallbackModels, source: 'default', error: 'Base URL не указан' };
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ не указан' };

      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`OpenAI-compatible models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || item.name || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'gemini') {
      const key = String(params.apiKey || process.env.GEMINI_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ Gemini не указан' };

      const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${encodeURIComponent(key)}\`);
      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`Gemini models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((item: any) => String(item.name || '').replace(/^models\\//, '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'deepseek') {
      const key = String(params.apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ DeepSeek не указан' };

      const endpoint = normalizeModelsEndpoint(params.baseUrl, 'https://api.deepseek.com');
      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`DeepSeek models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    if (provider === 'anthropic' || provider === 'claude') {
      const key = String(params.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '').trim();
      if (!key) return { models: fallbackModels, source: 'default', error: 'API-ключ Anthropic не указан' };

      const endpoint = String(params.baseUrl || 'https://api.anthropic.com/v1/models').trim();
      const response = await fetch(endpoint, {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`Anthropic models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((item: any) => String(item.id || '').trim()).filter(Boolean)
        : [];

      return { models: Array.from(new Set([...models, ...fallbackModels])), source: 'api' };
    }

    return { models: fallbackModels, source: 'default' };
  } catch (error: any) {
    return { models: fallbackModels, source: 'default', error: error.message };
  }
}

function normalizeAiBaseUrl(rawUrl?: string, fallback?: string): string {`
  );
}

/**
 * GET settings: добавляем modelCatalog.
 */
if (!server.includes('modelCatalog: settings.modelCatalog')) {
  server = server.replace(
`        baseUrl: settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(settings.apiKey)`,
`        baseUrl: settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(settings.apiKey),
        modelCatalog: settings.modelCatalog || getDefaultAiModels(settings.provider || 'gemini')`
  );
}

/**
 * PUT settings: сохраняем modelCatalog.
 */
server = server.replace(
`        apiKey: String(apiKey || '').trim() ? String(apiKey).trim() : previous.apiKey,
        baseUrl: String(baseUrl || '').trim()`,
`        apiKey: String(apiKey || '').trim() ? String(apiKey).trim() : previous.apiKey,
        baseUrl: String(baseUrl || '').trim(),
        modelCatalog: previous.modelCatalog || getDefaultAiModels(provider || previous.provider || 'gemini')`
);

server = server.replace(
`        baseUrl: db.ai_pbx_settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(db.ai_pbx_settings.apiKey)`,
`        baseUrl: db.ai_pbx_settings.baseUrl || '',
        apiKeyMasked: maskAiApiKey(db.ai_pbx_settings.apiKey),
        modelCatalog: db.ai_pbx_settings.modelCatalog || getDefaultAiModels(db.ai_pbx_settings.provider || 'gemini')`
);

/**
 * Добавляем endpoint обновления моделей перед Test Connection.
 */
if (!server.includes("settings/models'")) {
  server = server.replace(
`  // 18. Test Connection
  app.post('/api/ai-pbx-admin/settings/test-provider', requireAuth, async (req: Request, res: Response) => {`,
`  // 18. Refresh provider model list
  app.post('/api/ai-pbx-admin/settings/models', requireAuth, async (req: Request, res: Response) => {
    try {
      const db = await readLocalDb();
      const savedSettings = db.ai_pbx_settings || {};
      const provider = String(req.body?.provider || savedSettings.provider || 'gemini');
      const apiKey = String(req.body?.apiKey || '').trim() || savedSettings.apiKey || '';
      const baseUrl = String(req.body?.baseUrl || savedSettings.baseUrl || '').trim();

      const result = await discoverAiModels({ provider, apiKey, baseUrl });

      db.ai_pbx_settings = {
        ...savedSettings,
        provider,
        apiKey,
        baseUrl,
        modelCatalog: result.models
      };

      await writeLocalDb(db);

      res.json({
        success: true,
        provider,
        models: result.models,
        source: result.source,
        error: result.error || ''
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 19. Test Connection
  app.post('/api/ai-pbx-admin/settings/test-provider', requireAuth, async (req: Request, res: Response) => {`
  );
}

/**
 * UI
 */

if (!ui.includes('const [aiAvailableModels, setAiAvailableModels]')) {
  ui = ui.replace(
`  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiTemp, setAiTemp] = useState(0.4);`,
`  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiAvailableModels, setAiAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsStatus, setModelsStatus] = useState('');
  const [aiTemp, setAiTemp] = useState(0.4);`
  );
}

ui = ui.replace(
`        setAiBaseUrl(data.baseUrl || '');
        setAiTemp(data.temperature !== undefined ? data.temperature : 0.4);`,
`        setAiBaseUrl(data.baseUrl || '');
        setAiAvailableModels(Array.isArray(data.modelCatalog) ? data.modelCatalog : []);
        setAiTemp(data.temperature !== undefined ? data.temperature : 0.4);`
);

if (!ui.includes('const getFallbackModelsForProvider')) {
  ui = ui.replace(
`  // Save Settings
  const handleSaveSettings = async () => {`,
`  const getFallbackModelsForProvider = (provider: string) => {
    if (provider === 'openai') {
      return ['gpt-5.5', 'gpt-5.5-mini', 'gpt-5.5-nano', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'];
    }
    if (provider === 'gemini') {
      return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
    if (provider === 'anthropic') {
      return ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
    }
    if (provider === 'deepseek') {
      return ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'];
    }
    return ['gpt-4o-mini', 'gpt-4o', 'llama-3.1-70b', 'qwen2.5-coder-32b', 'custom-model'];
  };

  const handleRefreshModels = async () => {
    setIsLoadingModels(true);
    setModelsStatus('');
    try {
      const res = await fetch('/api/ai-pbx-admin/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const nextModels = Array.isArray(data.models) ? data.models : [];
        setAiAvailableModels(nextModels);
        if (!nextModels.includes(aiModel) && nextModels.length > 0) {
          setAiModel(nextModels[0]);
        }
        setModelsStatus(data.source === 'api'
          ? \`Модели обновлены через API: \${nextModels.length}\`
          : \`Используется базовый список моделей. \${data.error || ''}\`
        );
      } else {
        setModelsStatus('Не удалось обновить модели: ' + (data.error || 'неизвестная ошибка'));
      }
    } catch (e: any) {
      setModelsStatus('Сетевая ошибка обновления моделей: ' + e.message);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {`
  );
}

/**
 * При смене провайдера обновляем fallback-модели на фронте.
 */
ui = ui.replace(
`                    if (prov === 'gemini') setAiModel('gemini-3.5-flash');
                    else if (prov === 'openai') setAiModel('gpt-4o-mini');
                    else if (prov === 'anthropic') setAiModel('claude-3-5-haiku');
                    else if (prov === 'deepseek') setAiModel('deepseek-chat');
                    else if (prov === 'custom') setAiModel('gpt-4o-mini');`,
`                    const fallbackModels = getFallbackModelsForProvider(prov);
                    setAiAvailableModels(fallbackModels);
                    setAiModel(fallbackModels[0] || 'custom-model');
                    setModelsStatus('');`
);

/**
 * Заменяем select моделей на input+datalist+кнопку обновления.
 */
ui = ui.replace(
`              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">Языковая модель</label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                >
                  {aiProvider === 'gemini' && (
                    <>
                      <option value="gemini-3.5-flash">Gemini 3.5 Flash (рекомендуемая, быстрая)</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (глубокое рассуждение)</option>
                    </>
                  )}
                  {aiProvider === 'openai' && (
                    <>
                      <option value="gpt-4o-mini">GPT-4o Mini (быстрая, экономичная)</option>
                      <option value="gpt-4o">GPT-4o (высокая точность)</option>
                    </>
                  )}
                  {aiProvider === 'anthropic' && (
                    <>
                      <option value="claude-3-5-haiku">Claude 3.5 Haiku (быстрая)</option>
                      <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (продвинутая)</option>
                    </>
                  )}
                  {aiProvider === 'deepseek' && (
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
                  )}
                </select>
              </div>`,
`              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500">Языковая модель</label>
                <div className="flex gap-2">
                  <input
                    list="aipbxadmin-models"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="Выберите или впишите model id"
                    className="min-w-0 flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={isLoadingModels}
                    className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-900 text-white text-[10px] font-bold hover:bg-black disabled:opacity-60 flex items-center gap-1.5"
                    title="Получить актуальный список моделей от провайдера"
                  >
                    {isLoadingModels ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Модели
                  </button>
                </div>
                <datalist id="aipbxadmin-models">
                  {(aiAvailableModels.length ? aiAvailableModels : getFallbackModelsForProvider(aiProvider)).map(model => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Можно выбрать из списка или вписать любой model id вручную. Кнопка «Модели» обновляет список через API провайдера.
                </p>
                {modelsStatus && (
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 leading-relaxed">{modelsStatus}</p>
                )}
              </div>`
);

fs.writeFileSync(serverPath, server);
fs.writeFileSync(uiPath, ui);

console.log('Готово: добавлено самостоятельное обновление списка моделей AI-провайдера.');
