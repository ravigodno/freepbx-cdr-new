const fs = require('fs');

const file = 'server.ts';
let s = fs.readFileSync(file, 'utf8');

const marker = `app.use(express.json`;
const insert = `
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    const started = Date.now();
    console.log('[API START]', req.method, req.path, req.url);
    res.on('finish', () => {
      console.log('[API END]', req.method, req.path, res.statusCode, Date.now() - started + 'ms');
    });
  }
  next();
});

`;

if (s.includes('[API START]')) {
  console.log('API logger уже установлен');
  process.exit(0);
}

const idx = s.indexOf(marker);
if (idx === -1) {
  console.error('Не нашел место для вставки app.use(express.json...)');
  process.exit(1);
}

s = s.slice(0, idx) + insert + s.slice(idx);
fs.writeFileSync(file, s);
console.log('API logger добавлен в server.ts');
