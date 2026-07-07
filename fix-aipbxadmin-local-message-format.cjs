const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-local-message-format';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// Исправляем блок assistantMessage в локальной диагностике
s = s.replace(
/const assistantMessage = \{\s*id: 'msg_' \+ Date\.now\(\) \+ '_local_diag',\s*role: 'assistant',\s*content: localDiagnosticAnswer,\s*timestamp: new Date\(\)\.toISOString\(\)\s*\};/s,
`const assistantMessage = {
          id: 'msg_' + Date.now() + '_local_diag',
          role: 'assistant',
          type: 'assistant',
          content: localDiagnosticAnswer,
          text: localDiagnosticAnswer,
          createdAt: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };`
);

// Защита: если в session.messages есть битые элементы, удаляем их перед сохранением
s = s.replace(
/session\.messages\.push\(assistantMessage\);/g,
`session.messages = Array.isArray(session.messages)
          ? session.messages.filter((m: any) => m && typeof m === 'object' && m.role)
          : [];
        session.messages.push(assistantMessage);`
);

fs.writeFileSync(file, s);

console.log('OK: формат локального диагностического сообщения исправлен.');
