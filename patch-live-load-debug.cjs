const fs = require('fs');

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

const oldText = `  const loadLiveSessions = async () => {
    setIsLoadingLiveSessions(true);
    setLiveSessionsError('');`;

const newText = `  const loadLiveSessions = async () => {
    console.log('[LIVE_LOAD_DEBUG] loadLiveSessions called');
    setIsLoadingLiveSessions(true);
    setLiveSessionsError('');`;

if (!s.includes(oldText)) {
  console.error('Не найден loadLiveSessions block');
  process.exit(1);
}

s = s.replace(oldText, newText);
fs.writeFileSync(path, s);

console.log('OK: live load frontend debug inserted');
