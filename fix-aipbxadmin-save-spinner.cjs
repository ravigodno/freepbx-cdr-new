const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-save-spinner';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const start = s.indexOf('  // Save Settings');
const end = s.indexOf('  // Test Connection', start);

if (start === -1 || end === -1) {
  console.error('Не нашел блок Save Settings / Test Connection');
  process.exit(1);
}

const replacement = `  // Save Settings
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setTestResult(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch('/api/ai-pbx-admin/settings', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        signal: controller.signal,
        body: JSON.stringify({
          provider: aiProvider,
          model: aiModel,
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
        throw new Error('Сервер вернул не JSON: ' + text.slice(0, 250));
      }

      if (!res.ok) {
        throw new Error(data.error || 'HTTP ' + res.status);
      }

      setAiApiKey('');
      setAiApiKeyMasked(data.apiKeyMasked || aiApiKeyMasked || '');
      setAiBaseUrl(data.baseUrl || aiBaseUrl || '');

      setTestResult({
        success: true,
        message: 'Настройки AI-администратора успешно сохранены.'
      });

      alert('Настройки AI-администратора успешно сохранены.');
    } catch (e: any) {
      clearTimeout(timeout);

      const message = e?.name === 'AbortError'
        ? 'Сервер не ответил на сохранение за 10 секунд. Настройки могли не сохраниться.'
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

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log('Готово: кнопка сохранения больше не будет бесконечно крутиться.');
