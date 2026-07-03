const fs = require('fs');

const appPath = 'src/App.tsx';
const serverPath = 'server.ts';

let app = fs.readFileSync(appPath, 'utf8');
let server = fs.readFileSync(serverPath, 'utf8');

// 1. Frontend helper: fetch with timeout
const marker = `  // Connection Test routine for MariaDB`;
const helper = `  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 9000) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

`;

if (!app.includes('const fetchWithTimeout = async')) {
  if (!app.includes(marker)) {
    console.error('Не найден marker Connection Test routine for MariaDB в App.tsx');
    process.exit(1);
  }
  app = app.replace(marker, helper + marker);
}

// 2. Replace only settings test fetch calls
app = app.replace(
  `const resp = await fetch('/api/settings/test-db', {`,
  `const resp = await fetchWithTimeout('/api/settings/test-db', {`
);

app = app.replace(
  `const resp = await fetch('/api/settings/test-ami', {`,
  `const resp = await fetchWithTimeout('/api/settings/test-ami', {`
);

app = app.replace(
  `const resp = await fetch('/api/settings/test-freepbx-api', {`,
  `const resp = await fetchWithTimeout('/api/settings/test-freepbx-api', {`
);

// Add timeout argument after each test fetch options block.
// Safer: replace exact tail of each block.
app = app.replace(
  `        body: JSON.stringify(draftSettings)
      });`,
  `        body: JSON.stringify(draftSettings)
      }, 9000);`
);

// There are three identical bodies. If only first changed because replace without /g, do global manually.
app = app.replace(
  /body: JSON\.stringify\(draftSettings\)\n\s+\}\);/g,
  `body: JSON.stringify(draftSettings)
      }, 9000);`
);

// Better error message for AbortError
app = app.replace(
  /message: `Ошибка сокета: \$\{err\.message \|\| 'сервер недоступен'\}`/g,
  `message: err?.name === 'AbortError' ? 'Таймаут проверки связи: сервер не ответил за 9 секунд.' : \`Ошибка сокета: \${err.message || 'сервер недоступен'}\``
);

fs.writeFileSync(appPath, app);

// 3. Backend FreePBX OAuth token fetch timeout
const oldTokenFetch = `        const tokenRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json'
          },
          body: tokenBody.toString()
        });`;

const newTokenFetch = `        const tokenController = new AbortController();
        const tokenTimeoutId = setTimeout(() => tokenController.abort(), 7000);
        let tokenRes: any;

        try {
          tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json'
            },
            body: tokenBody.toString(),
            signal: tokenController.signal
          });
        } finally {
          clearTimeout(tokenTimeoutId);
        }`;

if (server.includes(oldTokenFetch) && !server.includes('const tokenController = new AbortController();')) {
  server = server.replace(oldTokenFetch, newTokenFetch);
}

fs.writeFileSync(serverPath, server);

console.log('OK: connection test timeouts patched.');
