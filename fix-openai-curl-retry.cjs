const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-openai-curl-retry';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const start = s.indexOf('async function callOpenAIChatViaCurlSafe');
const end = s.indexOf('\n\nasync function generateAIResponse', start);

if (start === -1 || end === -1) {
  console.error('Не найден блок callOpenAIChatViaCurlSafe');
  console.log({ startFound: start !== -1, endFound: end !== -1 });
  process.exit(1);
}

const newHelper = `async function callOpenAIChatViaCurlSafe(endpoint: string, key: string, payload: any): Promise<any> {
  const { execFile } = require('child_process');

  const body = JSON.stringify(payload);

  const runOnce = (attempt: number) => new Promise<any>((resolve, reject) => {
    execFile('curl', [
      '-4',
      '-sS',
      '--connect-timeout', '20',
      '--max-time', '75',
      '--retry', '2',
      '--retry-delay', '1',
      '--retry-all-errors',
      endpoint,
      '-H', 'Authorization: Bearer ' + key,
      '-H', 'Content-Type: application/json',
      '-H', 'OpenAI-Beta: assistants=v2',
      '-d', body
    ], {
      timeout: 90000,
      maxBuffer: 1024 * 1024 * 4
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error('curl OpenAI error attempt ' + attempt + ': ' + (stderr || error.message || String(error))));
        return;
      }

      try {
        const data = JSON.parse(String(stdout || '{}'));

        if (data.error) {
          const code = String(data.error.code || '');
          const msg = JSON.stringify(data.error);

          if (code === 'unsupported_country_region_territory') {
            reject(new Error('RETRYABLE_OPENAI_REGION_ERROR: ' + msg));
            return;
          }

          reject(new Error('OpenAI API error via curl: ' + msg));
          return;
        }

        resolve(data);
      } catch (e: any) {
        reject(new Error('OpenAI curl returned non-JSON: ' + String(stdout || '').slice(0, 1000)));
      }
    });
  });

  let lastError: any = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await runOnce(attempt);
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e);

      if (!msg.includes('RETRYABLE_OPENAI_REGION_ERROR')) {
        throw e;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error(String(lastError?.message || lastError || 'OpenAI curl failed after retries').replace('RETRYABLE_OPENAI_REGION_ERROR: ', 'OpenAI API error via curl after retries: '));
}`;

s = s.slice(0, start) + newHelper + s.slice(end);

fs.writeFileSync(file, s);

console.log('OK: OpenAI curl transport now retries region edge errors.');
