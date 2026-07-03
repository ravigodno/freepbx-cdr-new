const fs = require('fs');

const path = 'server.ts';
let s = fs.readFileSync(path, 'utf8');

const oldBlock = `      if (body?.errors?.length) {
        return res.status(400).json({ error: 'Ошибка GraphQL fetchAllExtensions: ' + JSON.stringify(body.errors) });
      }
      const result = body?.data?.fetchAllExtensions;
      if (!result) {
        return res.status(400).json({ error: 'GraphQL ответ не содержит data.fetchAllExtensions' });
      }`;

const newBlock = `      if (body?.errors?.length) {
        const errorText = JSON.stringify(body.errors);
        const sourceMode = String(settings.freepbxExtensionsSource || 'auto').toLowerCase();

        if (sourceMode === 'auto' && errorText.includes('fetchAllExtensions')) {
          return res.json({
            success: true,
            message: 'FreePBX API отвечает, но GraphQL метод fetchAllExtensions недоступен в этой версии FreePBX. Для extensions будет использован Auto/BMO/AMI fallback.'
          });
        }

        return res.status(400).json({ error: 'Ошибка GraphQL fetchAllExtensions: ' + errorText });
      }
      const result = body?.data?.fetchAllExtensions;
      if (!result) {
        const sourceMode = String(settings.freepbxExtensionsSource || 'auto').toLowerCase();

        if (sourceMode === 'auto') {
          return res.json({
            success: true,
            message: 'FreePBX API отвечает, но data.fetchAllExtensions отсутствует. Для extensions будет использован Auto/BMO/AMI fallback.'
          });
        }

        return res.status(400).json({ error: 'GraphQL ответ не содержит data.fetchAllExtensions' });
      }`;

if (!s.includes(oldBlock)) {
  console.error('Не найден блок обработки GraphQL errors/result');
  process.exit(1);
}

s = s.replace(oldBlock, newBlock);
fs.writeFileSync(path, s);

console.log('OK: FreePBX API test fallback patched.');
