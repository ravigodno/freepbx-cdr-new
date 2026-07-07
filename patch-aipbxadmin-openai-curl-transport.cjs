const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-openai-curl-transport';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('OPENAI_CURL_TRANSPORT_V1')) {
  const marker = 'async function generateAIResponse';

  if (!s.includes(marker)) {
    console.error('Не найден marker async function generateAIResponse');
    process.exit(1);
  }

  const helper = `
// OPENAI_CURL_TRANSPORT_V1
async function callOpenAIChatCompletionsViaCurl(payload: any, apiKey: string, baseUrl?: string): Promise<any> {
  const { execFile } = require('child_process');

  const endpoint = String(baseUrl || 'https://api.openai.com/v1').replace(/\\/$/, '') + '/chat/completions';
  const body = JSON.stringify(payload);

  return await new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS',
      '--max-time', '75',
      endpoint,
      '-H', 'Authorization: Bearer ' + apiKey,
      '-H', 'Content-Type: application/json',
      '-d', body
    ], {
      timeout: 80000,
      maxBuffer: 1024 * 1024 * 4
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error('curl OpenAI error: ' + (stderr || error.message || String(error))));
        return;
      }

      try {
        const json = JSON.parse(String(stdout || '{}'));

        if (json.error) {
          reject(new Error('OpenAI API error via curl: ' + JSON.stringify(json.error)));
          return;
        }

        resolve(json);
      } catch (e: any) {
        reject(new Error('OpenAI curl returned non-JSON: ' + String(stdout || '').slice(0, 1000)));
      }
    });
  });
}

`;

  s = s.replace(marker, helper + marker);
  console.log('Добавлен curl transport helper.');
}

// Вставляем принудительный OpenAI-curl в начало generateAIResponse после открытия функции.
// Патч рассчитан на уже существующие переменные provider/model/messages/apiKey/baseUrl внутри функции.
if (!s.includes('OPENAI_CURL_TRANSPORT_FORCE_V1')) {
  const fnStart = s.indexOf('async function generateAIResponse');
  const brace = s.indexOf('{', fnStart);

  if (fnStart === -1 || brace === -1) {
    console.error('Не найдено тело generateAIResponse');
    process.exit(1);
  }

  const inject = `

  // OPENAI_CURL_TRANSPORT_FORCE_V1
  {
    const maybeParams: any = arguments[0] || {};
    const p = String(maybeParams.provider || maybeParams.aiProvider || '').toLowerCase();

    if (p === 'openai') {
      const model = maybeParams.model || 'gpt-4o-mini';
      const apiKey = String(maybeParams.apiKey || '').trim();
      const baseUrl = String(maybeParams.baseUrl || '').trim();
      const temperature = maybeParams.temperature !== undefined ? Number(maybeParams.temperature) : 0.2;
      const systemPrompt = String(maybeParams.systemPrompt || '');
      const inputMessages = Array.isArray(maybeParams.messages) ? maybeParams.messages : [];

      if (!apiKey) {
        throw new Error('OpenAI API key is empty');
      }

      const openAiMessages = [];

      if (systemPrompt.trim()) {
        openAiMessages.push({
          role: 'system',
          content: systemPrompt
        });
      }

      for (const m of inputMessages) {
        const role = m?.role === 'assistant' ? 'assistant' : 'user';
        const content = String(m?.content || m?.text || '');
        if (content.trim()) {
          openAiMessages.push({ role, content });
        }
      }

      if (openAiMessages.length === 0) {
        openAiMessages.push({
          role: 'user',
          content: 'Ответь коротко: OK'
        });
      }

      const data: any = await callOpenAIChatCompletionsViaCurl({
        model,
        messages: openAiMessages,
        temperature
      }, apiKey, baseUrl);

      return String(data?.choices?.[0]?.message?.content || '').trim();
    }
  }
`;

  s = s.slice(0, brace + 1) + inject + s.slice(brace + 1);
  console.log('OpenAI transport принудительно переключен на curl.');
} else {
  console.log('OpenAI curl transport уже включен.');
}

fs.writeFileSync(file, s);

console.log('OK: PBXPuls OpenAI calls now use curl transport.');
