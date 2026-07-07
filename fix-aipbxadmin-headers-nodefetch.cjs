const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-headers-nodefetch';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (s.includes("import fetch, { Headers } from 'node-fetch';")) {
  console.log('Headers уже импортирован');
} else if (s.includes("import fetch from 'node-fetch';")) {
  s = s.replace(
    "import fetch from 'node-fetch';",
    "import fetch, { Headers } from 'node-fetch';"
  );
  console.log('Добавлен импорт Headers из node-fetch');
} else if (s.includes('from "node-fetch"')) {
  console.error('Нестандартный импорт node-fetch. Покажите первые 30 строк server/aiPbxAdmin.ts');
  process.exit(1);
} else {
  console.error('Не найден импорт node-fetch');
  process.exit(1);
}

fs.writeFileSync(file, s);
