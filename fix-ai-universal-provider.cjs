const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';
let s = fs.readFileSync(file, 'utf8');

if (!s.includes('generateAIResponse')) {
  console.log('AI handler already custom or missing generateAIResponse');
}

console.log('Adding OpenAI-compatible safety wrapper...');

// безопасный fallback provider mapping
s = s.replace(
  /provider:\s*['"].+?['"]/g,
  "provider: settings.provider || 'openai'"
);

// гарантируем модель fallback
s = s.replace(
  /model:\s*['"].+?['"]/g,
  "model: settings.model || 'gpt-4o-mini'"
);

fs.writeFileSync(file, s);
console.log('patched universal provider fallback');
