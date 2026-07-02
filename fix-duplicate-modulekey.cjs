const fs = require('fs');

const path = 'src/modules/access/components/PermissionsMatrixTab.tsx';
let s = fs.readFileSync(path, 'utf8');

const keys = ['marketing', 'monitoring', 'management', 'balance'];

for (const key of keys) {
  const re = new RegExp(`(moduleKey: '${key}',\\n)(\\s*moduleKey: '${key}',\\n)+`, 'g');
  s = s.replace(re, `$1`);
}

fs.writeFileSync(path, s);
console.log('OK: duplicate moduleKey fields removed.');
