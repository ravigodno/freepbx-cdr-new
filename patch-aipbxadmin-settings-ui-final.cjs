const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-final-settings-ui';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

/**
 * 0. Удаляем отдельную временную страницу.
 */
for (const p of ['public/ai-settings.html', 'dist/ai-settings.html']) {
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log('Удалено временное окно:', p);
  }
}

/**
 * 1. Добавляем state для API key / Base URL.
 */
if (!s.includes('const [aiApiKey, setAiApiKey]')) {
  s = s.replace(
    /const \[aiModel,\s*setAiModel\]\s*=\s*useState<[^;]+;/,
    (m) => `${m}
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');`
  );
}

/**
 * 2. fetchSettings должен забирать masked key и baseUrl.
 */
if (!s.includes('setAiApiKeyMasked(data.apiKeyMasked')) {
  s = s.replace(
    /setAiModel\(data\.model \|\| ['"][^'"]+['"]\);\n/,
    (m) => `${m}        setAiApiKey('');
        setAiApiKeyMasked(data.apiKeyMasked || '');
        setAiBaseUrl(data.baseUrl || '');
`
  );
}

/**
 * 3. Полностью заменяем Save Settings handler на безопасный.
 */
const saveStart = s.indexOf('  // Save Settings');
const testStart = s.indexOf('  // Test Connection', saveStart);

if (saveStart === -1 || testStart === -1) {
  console.error('Не найден блок Save Settings / Test Connection');
  process.exit(1);
}

const saveBlock = `  // Save Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setTestResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/ai-pbx-admin/settings', {
        method: 'PUT',
        headers: typeof authHeaders === 'function'
          ? authHeaders({ 'Content-Type': 'application/json' })
          : { 'Content-Type': 'application/json' },
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
        throw new Error(data.error || 'HTTP ' + res.status);
      }

      setAiApiKey('');
      setAiApiKeyMasked(data.apiKeyMasked || '');
      setAiBaseUrl(data.baseUrl || aiBaseUrl || '');

      setTestResult({
        success: true,
        message: 'Настройки AI-администратора успешно сохранены.'
      });

      alert('Настройки AI-администратора успешно сохранены.');
    } catch (e: any) {
      clearTimeout(timeout);

      const message = e?.name === 'AbortError'
        ? 'Сервер не ответил за 15 секунд.'
        : 'Ошибка сохранения настроек: ' + (e?.message || 'неизвестная ошибка');

      console.error('[AIPBXAdmin] save settings failed:', e);

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

s = s.slice(0, saveStart) + saveBlock + s.slice(testStart);

/**
 * 4. Test Provider тоже должен отправлять apiKey/baseUrl.
 */
s = s.replace(
  /body:\s*JSON\.stringify\(\{\s*provider:\s*aiProvider,\s*model:\s*aiModel,\s*temperature:\s*aiTemp,\s*systemPrompt:\s*aiSystemPrompt\s*\}\)/g,
  `body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl,
          temperature: aiTemp,
          systemPrompt: aiSystemPrompt
        })`
);

/**
 * 5. Добавляем поля API key и Base URL в существующее окно настроек.
 * Вставляем перед кнопкой "Сохранить настройки".
 */
if (!s.includes('id="aipbxadmin-api-key-input"')) {
  const marker = `{/* Save settings action button */}`;

  const fields = `
            <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  API key
                </label>
                <input
                  id="aipbxadmin-api-key-input"
                  type="password"
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="Вставьте новый ключ. Если оставить пустым — старый ключ сохранится."
                  className="mt-1 w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                  autoComplete="off"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Сейчас сохранено: <span className="font-mono">{aiApiKeyMasked || 'ключ не сохранен'}</span>
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Base URL
                </label>
                <input
                  type="text"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="Для OpenAI оставить пустым. Для OpenRouter: https://openrouter.ai/api/v1"
                  className="mt-1 w-full px-3.5 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

`;

  if (!s.includes(marker)) {
    console.error('Не найден маркер кнопки Save settings action button');
    process.exit(1);
  }

  s = s.replace(marker, fields + '            ' + marker);
}

fs.writeFileSync(file, s);

console.log('OK: штатное окно AI-админа получило API key / Base URL / нормальное сохранение.');
