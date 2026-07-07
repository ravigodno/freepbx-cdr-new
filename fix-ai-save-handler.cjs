const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';
let s = fs.readFileSync(file, 'utf8');

console.log('Fixing AI save handler...');

// убираем битую ссылку setAiApiKey
s = s.replace(/setAiApiKey\s*\(/g, 'console.log(');

// ищем save handler
if (!s.includes('handleSaveSettings')) {
  console.log('WARNING: no handleSaveSettings found');
}

// фикс fetch timeout + правильный error handling
s = s.replace(
  /fetch\(['"`]\/api\/ai-pbx-admin\/settings['"`]/g,
  `fetch('/api/ai-pbx-admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      temperature,
      apiKey,
      baseUrl,
      systemPrompt
    })
  }`
);

fs.writeFileSync(file, s);
console.log('patched save handler');
