const fs = require('fs');

const path = 'src/modules/access/components/PermissionsMatrixTab.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('const renderModuleVisibilityPanel')) {
  console.error('Не найдена функция renderModuleVisibilityPanel. Значит предыдущий патч не добавил SU-панель.');
  process.exit(1);
}

// Убираем возможную неудачную вставку, если она попала не туда.
s = s.replace(/\n\s*\{renderModuleVisibilityPanel\(\)\}/g, '');

// Ищем главный return компонента. Берем последний "return (" в файле,
// потому что выше могут быть return внутри helper-функций.
const marker = '  return (';
const idx = s.lastIndexOf(marker);

if (idx === -1) {
  console.error('Не найден главный return компонента.');
  process.exit(1);
}

const afterReturn = idx + marker.length;
const nextPart = s.slice(afterReturn);

// Вставляем панель сразу первым элементом внутри return.
// Если там уже fragment <> — вставляем после него.
// Если там div — оборачивать не надо, вставим после открывающего div.
let patched = s;

const fragmentIdx = nextPart.indexOf('<>');
const divIdx = nextPart.indexOf('<div');

if (fragmentIdx !== -1 && fragmentIdx < 20) {
  const absolute = afterReturn + fragmentIdx + 2;
  patched = s.slice(0, absolute) + '\n      {renderModuleVisibilityPanel()}' + s.slice(absolute);
} else if (divIdx !== -1 && divIdx < 80) {
  const absoluteDiv = afterReturn + divIdx;
  const openEnd = s.indexOf('>', absoluteDiv);
  if (openEnd === -1) {
    console.error('Не найден конец открывающего div.');
    process.exit(1);
  }
  patched = s.slice(0, openEnd + 1) + '\n      {renderModuleVisibilityPanel()}' + s.slice(openEnd + 1);
} else {
  console.error('Не понял структуру return. Покажи sed -n 300,380p src/modules/access/components/PermissionsMatrixTab.tsx');
  process.exit(1);
}

fs.writeFileSync(path, patched);
console.log('OK: renderModuleVisibilityPanel inserted into main return.');
