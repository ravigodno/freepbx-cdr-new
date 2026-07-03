const fs = require('fs');

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

const oldText = "const response = await fetch('/api/live-sessions-test', {";
const newText = "const response = await fetch('/api/live-sessions', {";

if (!s.includes(oldText)) {
  console.error("Не найден fetch('/api/live-sessions-test')");
  process.exit(1);
}

s = s.replace(oldText, newText);
fs.writeFileSync(path, s);

console.log('OK: Active Calls v2 switched to /api/live-sessions');
