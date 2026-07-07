const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-openai-region-fallback';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const oldLine = "throw new Error(`OpenAI API error (${res.status}): ${errText}`);";

const newBlock = `
      if (
        res.status === 403 &&
        (
          String(errText).includes('unsupported_country_region_territory') ||
          String(errText).includes('Country, region, or territory not supported')
        )
      ) {
        return 'OpenAI сейчас недоступен с IP-адреса этой АТС из-за регионального ограничения. Для диагностики АТС используйте локальные запросы: «Проверь, все ли транки на связи», «Проверь PJSIP», «Проверь очереди», «Проверь RTP», «Проверь активные каналы». Эти проверки выполняются локально без обращения к OpenAI.';
      }

      throw new Error(\`OpenAI API error (\${res.status}): \${errText}\`);`;

if (!s.includes(oldLine)) {
  console.error('Не нашел строку OpenAI throw. Возможно файл уже изменен.');
  process.exit(1);
}

s = s.replace(oldLine, newBlock);

fs.writeFileSync(file, s);

console.log('OK: OpenAI region fallback добавлен.');
