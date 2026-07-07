const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-missing-apikey-state';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('const [aiApiKey, setAiApiKey]')) {
  const marker = 'const [aiModel, setAiModel]';

  const idx = s.indexOf(marker);
  if (idx === -1) {
    console.error('Не нашел state aiModel. Покажи вывод: grep -n "aiModel\\|aiProvider" src/components/AIPBXAdminTab.tsx | head -40');
    process.exit(1);
  }

  const lineEnd = s.indexOf('\n', idx);
  if (lineEnd === -1) {
    console.error('Не смог определить конец строки aiModel');
    process.exit(1);
  }

  const insert = `
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiApiKeyMasked, setAiApiKeyMasked] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');`;

  s = s.slice(0, lineEnd) + insert + s.slice(lineEnd);
  console.log('Добавлены useState для aiApiKey / aiApiKeyMasked / aiBaseUrl');
} else {
  console.log('State aiApiKey уже есть');
}

fs.writeFileSync(file, s);
