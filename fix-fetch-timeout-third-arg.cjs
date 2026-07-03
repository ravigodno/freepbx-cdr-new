const fs = require('fs');

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

let fixed = 0;

s = s.replace(/\}, 9000\);/g, (match, offset) => {
  const before = s.slice(Math.max(0, offset - 800), offset);
  const lastFetchWithTimeout = before.lastIndexOf('fetchWithTimeout(');
  const lastFetch = before.lastIndexOf('fetch(');

  // Если ближайший вызов — fetchWithTimeout, оставляем третий аргумент.
  if (lastFetchWithTimeout > lastFetch) {
    return match;
  }

  fixed++;
  return '});';
});

fs.writeFileSync(path, s);
console.log('OK: removed invalid third argument from regular fetch calls:', fixed);
