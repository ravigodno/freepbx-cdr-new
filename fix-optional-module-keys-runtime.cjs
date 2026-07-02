const fs = require('fs');

const path = 'server.ts';
let s = fs.readFileSync(path, 'utf8');

const safeKeysConst = `
const getOptionalModuleKeys = (): OptionalModuleKey[] => ['marketing', 'monitoring', 'management', 'balance'];
`;

if (!s.includes('const getOptionalModuleKeys = ()')) {
  s = s.replace(
    `const OPTIONAL_MODULE_KEYS: OptionalModuleKey[] = ['marketing', 'monitoring', 'management', 'balance'];`,
    `const OPTIONAL_MODULE_KEYS: OptionalModuleKey[] = ['marketing', 'monitoring', 'management', 'balance'];${safeKeysConst}`
  );
}

// В normalizeModuleVisibilitySettings
s = s.replace(
  `for (const key of OPTIONAL_MODULE_KEYS) {`,
  `for (const key of getOptionalModuleKeys()) {`
);

// В PUT /api/settings/module-visibility, если там тоже использовалось
s = s.replace(
  `for (const key of OPTIONAL_MODULE_KEYS) {`,
  `for (const key of getOptionalModuleKeys()) {`
);

fs.writeFileSync(path, s);
console.log('Fixed OPTIONAL_MODULE_KEYS runtime iteration.');
