const fs = require('fs');
const path = require('path');

const serverPath = path.join(process.cwd(), 'server', 'aiPbxAdmin.ts');
const uiPath = path.join(process.cwd(), 'src', 'components', 'AIPBXAdminTab.tsx');

for (const file of [serverPath, uiPath]) {
  if (!fs.existsSync(file)) {
    console.error('Не найден файл:', file);
    process.exit(1);
  }

  const bak = file + '.bak-models-timeout';
  if (!fs.existsSync(bak)) {
    fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
    console.log('Backup создан:', bak);
  }
}

let server = fs.readFileSync(serverPath, 'utf8');
let ui = fs.readFileSync(uiPath, 'utf8');

/**
 * SERVER: helper fetchJsonWithTimeout
 */
if (!server.includes('async function fetchJsonWithTimeout')) {
  server = server.replace(
`function normalizeModelsEndpoint(rawUrl?: string, fallback?: string): string {`,
`async function fetchJsonWithTimeout(url: string, options: any = {}, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(\`\${response.status} \${text.slice(0, 500)}\`);
    }

    try {
      return JSON.parse(text);
    } catch (e: any) {
      throw new Error('Провайдер вернул не JSON: ' + text.slice(0, 300));
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(\`Таймаут запроса моделей \${Math.round(timeoutMs / 1000)} сек\`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeModelsEndpoint(rawUrl?: string, fallback?: string): string {`
  );
}

/**
 * SERVER: заменяем fetch в discoverAiModels на fetchJsonWithTimeout
 */
server = server.replace(
`      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`OpenAI models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();`,
`      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });`
);

server = server.replace(
`      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`OpenAI-compatible models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();`,
`      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });`
);

server = server.replace(
`      const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${encodeURIComponent(key)}\`);
      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`Gemini models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();`,
`      const data: any = await fetchJsonWithTimeout(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${encodeURIComponent(key)}\`);`
);

server = server.replace(
`      const response = await fetch(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`DeepSeek models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();`,
`      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: { Authorization: \`Bearer \${key}\` }
      });`
);

server = server.replace(
`      const response = await fetch(endpoint, {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }
      });

      if (!response.ok) {
        return { models: fallbackModels, source: 'default', error: \`Anthropic models API: \${response.status} \${await response.text()}\` };
      }

      const data: any = await response.json();`,
`      const data: any = await fetchJsonWithTimeout(endpoint, {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        }
      });`
);

/**
 * UI: добавляем AbortController на кнопку "Модели"
 */
ui = ui.replace(
`      const res = await fetch('/api/ai-pbx-admin/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl
        })
      });

      const data = await res.json();`,
`      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch('/api/ai-pbx-admin/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          baseUrl: aiBaseUrl
        })
      });

      clearTimeout(timeout);
      const data = await res.json();`
);

ui = ui.replace(
`    } catch (e: any) {
      setModelsStatus('Сетевая ошибка обновления моделей: ' + e.message);
    } finally {
      setIsLoadingModels(false);
    }`,
`    } catch (e: any) {
      const fallbackModels = getFallbackModelsForProvider(aiProvider);
      setAiAvailableModels(fallbackModels);
      if (!fallbackModels.includes(aiModel) && fallbackModels.length > 0) {
        setAiModel(fallbackModels[0]);
      }
      setModelsStatus(e?.name === 'AbortError'
        ? 'Провайдер долго не отвечает. Загружен базовый список моделей.'
        : 'Сетевая ошибка обновления моделей: ' + e.message
      );
    } finally {
      setIsLoadingModels(false);
    }`
);

fs.writeFileSync(serverPath, server);
fs.writeFileSync(uiPath, ui);

console.log('Готово: добавлены таймауты для обновления списка моделей.');
