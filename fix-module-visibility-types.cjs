const fs = require('fs');

const serverPath = 'server.ts';
const typesPath = 'src/types.ts';

let server = fs.readFileSync(serverPath, 'utf8');

// 1. Убираем ошибочную строку из normalizeModuleVisibilitySettings,
// где next является Record<OptionalModuleKey, boolean>, а не localDb.
server = server.replace(
`\n  next.settings.moduleVisibility = normalizeModuleVisibilitySettings(next.settings.moduleVisibility);\n`,
`\n`
);

// 2. Правильно добавляем нормализацию в normalizeLocalDbSchema перед return next;
// ищем именно блок после создания const next = { ... }.
const normalizeMarker = `    contactSyncMappings: Array.isArray(db?.contactSyncMappings) ? db.contactSyncMappings : [],
    directoryColumnSettings: db?.directoryColumnSettings && typeof db.directoryColumnSettings === 'object' ? db.directoryColumnSettings : {}
  };

  return next;`;

if (server.includes(normalizeMarker)) {
  server = server.replace(
    normalizeMarker,
`    contactSyncMappings: Array.isArray(db?.contactSyncMappings) ? db.contactSyncMappings : [],
    directoryColumnSettings: db?.directoryColumnSettings && typeof db.directoryColumnSettings === 'object' ? db.directoryColumnSettings : {}
  };

  next.settings.moduleVisibility = normalizeModuleVisibilitySettings(next.settings?.moduleVisibility);

  return next;`
  );
} else if (!server.includes('next.settings.moduleVisibility = normalizeModuleVisibilitySettings(next.settings?.moduleVisibility);')) {
  console.warn('WARN: Не нашел точный маркер normalizeLocalDbSchema. Проверь sed -n 3520,3588p server.ts');
}

fs.writeFileSync(serverPath, server);

// 3. Добавляем moduleVisibility в AppSettings.
let types = fs.readFileSync(typesPath, 'utf8');

if (!types.includes('moduleVisibility?:')) {
  const marker = `export interface AppSettings {`;
  const idx = types.indexOf(marker);

  if (idx === -1) {
    console.warn('WARN: Не найден export interface AppSettings в src/types.ts');
  } else {
    const insertAt = types.indexOf('{', idx) + 1;
    types =
      types.slice(0, insertAt) +
`
  moduleVisibility?: {
    marketing?: boolean;
    monitoring?: boolean;
    management?: boolean;
    balance?: boolean;
  };` +
      types.slice(insertAt);
  }
}

fs.writeFileSync(typesPath, types);

console.log('Fixed moduleVisibility normalization and AppSettings type.');
