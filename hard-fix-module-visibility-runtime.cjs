const fs = require('fs');

const path = 'server.ts';
let s = fs.readFileSync(path, 'utf8');

const start = s.indexOf('function normalizeModuleVisibilitySettings(value: any): Record<OptionalModuleKey, boolean> {');
const end = s.indexOf('\n}\n\nfunction isModuleVisibleForAuthUser', start);

if (start === -1 || end === -1) {
  console.error('Не нашел функцию normalizeModuleVisibilitySettings. Покажи sed -n 3545,3595p server.ts');
  process.exit(1);
}

const replacement = `function normalizeModuleVisibilitySettings(value: any): Record<OptionalModuleKey, boolean> {
  const next: Record<OptionalModuleKey, boolean> = {
    marketing: true,
    monitoring: true,
    management: true,
    balance: true
  };

  const source = value && typeof value === 'object' ? value : {};

  if (typeof source.marketing === 'boolean') next.marketing = source.marketing;
  if (typeof source.monitoring === 'boolean') next.monitoring = source.monitoring;
  if (typeof source.management === 'boolean') next.management = source.management;
  if (typeof source.balance === 'boolean') next.balance = source.balance;

  return next;
}`;

s = s.slice(0, start) + replacement + s.slice(end + 3);

fs.writeFileSync(path, s);
console.log('Hard fixed normalizeModuleVisibilitySettings runtime.');
