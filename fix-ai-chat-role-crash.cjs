const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('File not found:', file);
  process.exit(1);
}

let s = fs.readFileSync(file, 'utf8');

// backup
const bak = file + '.bak-chat-role-fix';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, s);
  console.log('Backup created:', bak);
}

/**
 * 1. FIX: unify input parsing (text ONLY)
 */
s = s.replace(
  /const userDiagnosticText = String\([\s\S]*?\);/,
  `const userDiagnosticText = String(req.body?.text || '').trim();`
);

/**
 * 2. FIX: protect empty input
 */
if (!s.includes('Empty diagnostic request')) {
  s = s.replace(
    /const userDiagnosticText = String\(req\.body\?\.text \|\| ''\)\.trim\(\);/,
    `const userDiagnosticText = String(req.body?.text || '').trim();

      if (!userDiagnosticText) {
        return res.status(400).json({
          error: 'Empty diagnostic request'
        });
      }`
  );
}

/**
 * 3. FIX: assistant message schema (NO content/type chaos)
 */
s = s.replace(
  /const assistantMessage = \{[\s\S]*?createdAt:[\s\S]*?\};/,
  `const assistantMessage = {
          id: 'msg_' + Date.now() + '_local_diag',
          role: 'assistant',
          text: localDiagnosticAnswer,
          createdAt: new Date().toISOString()
        };`
);

/**
 * 4. FIX: ensure message filtering ALWAYS keeps role-safe objects
 */
s = s.replace(
  /session\.messages = Array\.isArray\([\s\S]*?\);/,
  `session.messages = Array.isArray(session.messages)
          ? session.messages.filter((m: any) =>
              m &&
              typeof m === 'object' &&
              typeof m.role === 'string'
            )
          : [];`
);

fs.writeFileSync(file, s);

console.log('OK: AI chat role crash + schema fixed');
