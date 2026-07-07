const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-cleanup-local-hardcode';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const blocks = [
  {
    name: 'STABLE_LOCAL_TRUNKS_DIAG_V1',
    start: '// STABLE_LOCAL_TRUNKS_DIAG_V1',
    end: 'async function generateAIResponse'
  },
  {
    name: 'LOCAL_DIAGNOSTIC_CHAT_PATCH_V1',
    start: '// LOCAL_DIAGNOSTIC_CHAT_PATCH_V1',
    end: 'async function generateAIResponse'
  }
];

for (const b of blocks) {
  const start = s.indexOf(b.start);
  const end = s.indexOf(b.end, start);

  if (start !== -1 && end !== -1) {
    s = s.slice(0, start) + s.slice(end);
    console.log('Удален блок:', b.name);
  } else {
    console.log('Блок не найден или уже удален:', b.name);
  }
}

// Удаляем стабильный локальный intercept внутри message route
s = s.replace(
/\s*\/\/ STABLE_LOCAL_TRUNKS_INTERCEPT_V1[\s\S]*?return res\.json\(\{[\s\S]*?session[\s\S]*?\}\);\s*\}\s*/g,
'\n'
);

// Удаляем старые disabled-комментарии от костылей
s = s.replace(/\/\/ old local diagnostic intercept disabled by stable patch/g, '');

fs.writeFileSync(file, s);

console.log('OK: локальный hardcode-перехват диагностик удален. Следующий шаг — добавить AI tool-router.');
