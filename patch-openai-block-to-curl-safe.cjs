const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-openai-block-curl-safe';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Добавляем helper curl, но НЕ внутрь generateAIResponse
if (!s.includes('OPENAI_CURL_HELPER_SAFE_V1')) {
  const marker = 'async function generateAIResponse';

  if (!s.includes(marker)) {
    console.error('Не найден marker async function generateAIResponse');
    process.exit(1);
  }

  const helper = `
// OPENAI_CURL_HELPER_SAFE_V1
async function callOpenAIChatViaCurlSafe(endpoint: string, key: string, payload: any): Promise<any> {
  const { execFile } = require('child_process');

  return await new Promise((resolve, reject) => {
    execFile('curl', [
      '-sS',
      '--max-time', '75',
      endpoint,
      '-H', 'Authorization: Bearer ' + key,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify(payload)
    ], {
      timeout: 80000,
      maxBuffer: 1024 * 1024 * 4
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error('curl OpenAI error: ' + (stderr || error.message || String(error))));
        return;
      }

      try {
        const data = JSON.parse(String(stdout || '{}'));

        if (data.error) {
          reject(new Error('OpenAI API error via curl: ' + JSON.stringify(data.error)));
          return;
        }

        resolve(data);
      } catch (e: any) {
        reject(new Error('OpenAI curl returned non-JSON: ' + String(stdout || '').slice(0, 1000)));
      }
    });
  });
}

`;

  s = s.replace(marker, helper + marker);
  console.log('Добавлен helper curl OpenAI.');
}

// 2. Заменяем только OpenAI block в generateAIResponse
const startMarker = "  // 2. OpenAI ChatGPT";
const start = s.indexOf(startMarker);
const nextMarker = "  // 3.";
const end = s.indexOf(nextMarker, start);

if (start === -1 || end === -1) {
  console.error('Не найден OpenAI block или следующий marker // 3.');
  console.log({ startFound: start !== -1, endFound: end !== -1 });
  process.exit(1);
}

const newOpenAIBlock = `  // 2. OpenAI ChatGPT
  if (provider === 'openai') {
    const key = String(apiKey || process.env.OPENAI_API_KEY || '').trim();
    if (!key) {
      throw new Error('Укажите API-ключ OpenAI в настройках AI-администратора или переменную OPENAI_API_KEY в .env.');
    }

    const endpoint = normalizeAiBaseUrl(baseUrl, 'https://api.openai.com/v1');

    const payload = {
      model: model || 'gpt-4o-mini',
      temperature: Number(temperature),
      messages: [
        { role: 'system', content: systemPrompt || '' },
        ...messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: String(m.text || '')
        })).filter(m => m.content.trim())
      ]
    };

    if (responseType === 'json') {
      (payload as any).response_format = { type: 'json_object' };
    }

    const data: any = await callOpenAIChatViaCurlSafe(endpoint, key, payload);

    return String(data?.choices?.[0]?.message?.content || '').trim();
  }

`;

s = s.slice(0, start) + newOpenAIBlock + s.slice(end);

fs.writeFileSync(file, s);

console.log('OK: OpenAI block replaced with safe curl transport.');
