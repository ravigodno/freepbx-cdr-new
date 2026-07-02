const fs = require('fs');

const roleMatrixPath = 'src/modules/access/roleMatrix.ts';
let s = fs.readFileSync(roleMatrixPath, 'utf8');

const removeAdminDefaults = [
  "'view_marketing',",
  "'manage_marketing',",
  "'manage_calltracking',",
  "'manage_yandex_metrika',",
  "'manage_yandex_direct',",
  "'view_balance',",
  "'view_balance_analytics',",
  "'manage_balance_sources',",
  "'view_balance_alerts',",
  "'manage_balance_providers',"
];

for (const item of removeAdminDefaults) {
  s = s.replace(new RegExp(`\\n\\s*${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '');
}

fs.writeFileSync(roleMatrixPath, s);
console.log('OK: removed hardcoded marketing/balance defaults from admin roleMatrix.');
