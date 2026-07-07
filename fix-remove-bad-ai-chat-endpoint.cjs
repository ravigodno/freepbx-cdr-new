const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-remove-bad-chat-endpoint';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const startMarker = '// ===== PBXPULS CHAT GATEWAY';
const start = s.indexOf(startMarker);

if (start === -1) {
  console.log('Сломанный CHAT GATEWAY блок не найден — возможно уже удален.');
} else {
  s = s.slice(0, start).trimEnd() + '\n';
  fs.writeFileSync(file, s);
  console.log('Удален сломанный /api/ai-pbx-admin/chat endpoint вне функции.');
}
