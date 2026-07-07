const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/components/AIPBXAdminTab.tsx');

if (!fs.existsSync(filePath)) {
  console.error('Не найден файл:', filePath);
  process.exit(1);
}

const bak = filePath + '.bak-token-storage-final';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(filePath, 'utf8'));
  console.log('Backup создан:', bak);
}

let code = fs.readFileSync(filePath, 'utf8');

const oldBlock = `  const authHeaders = (extra: Record<string, string> = {}) => ({
    ...(userSession?.token ? { Authorization: \`Bearer \${userSession.token}\` } : {}),
    ...extra
  });`;

const newBlock = `  const authHeaders = (extra: Record<string, string> = {}) => {
    const token =
      userSession?.token ||
      localStorage.getItem('asterisk_cdr_token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('token') ||
      '';

    return {
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...extra
    };
  };`;

if (!code.includes(oldBlock)) {
  console.error('Не нашел старый authHeaders. Текущий блок:');
  const idx = code.indexOf('const authHeaders');
  console.error(code.slice(Math.max(0, idx - 100), idx + 600));
  process.exit(1);
}

code = code.replace(oldBlock, newBlock);

fs.writeFileSync(filePath, code);

console.log('Готово: AI-админ теперь берет токен из userSession и localStorage asterisk_cdr_token.');
