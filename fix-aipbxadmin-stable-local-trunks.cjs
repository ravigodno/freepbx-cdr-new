const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-stable-local-trunks';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Отключаем старый битый локальный перехват, если он есть
s = s.replace(
  /const userDiagnosticText = String\(req\.body\?\.text \|\| ''\)\.trim\(\);\s*if \(!userDiagnosticText\) \{[\s\S]*?const localDiagnosticAnswer = await runLocalAsteriskDiagnosticFromChat\(userDiagnosticText\);[\s\S]*?return res\.json\(\{[\s\S]*?session[\s\S]*?\}\);\s*\}/,
  `// old local diagnostic intercept disabled by stable patch`
);

s = s.replace(
  /const userDiagnosticText = String\(req\.body\?\.content \|\| req\.body\?\.message \|\| req\.body\?\.text \|\| req\.body\?\.prompt \|\| ''\);\s*const localDiagnosticAnswer = await runLocalAsteriskDiagnosticFromChat\(userDiagnosticText\);[\s\S]*?return res\.json\(\{[\s\S]*?session[\s\S]*?\}\);\s*\}/,
  `// old mixed local diagnostic intercept disabled by stable patch`
);

// 2. Добавляем стабильную функцию локальной диагностики транков
if (!s.includes('STABLE_LOCAL_TRUNKS_DIAG_V1')) {
  const marker = 'async function generateAIResponse';
  if (!s.includes(marker)) {
    console.error('Не найден marker generateAIResponse');
    process.exit(1);
  }

  const helper = `
// STABLE_LOCAL_TRUNKS_DIAG_V1
async function runStableLocalTrunksDiagnostic(userText: string): Promise<string | null> {
  const { execFile } = require('child_process');

  const text = String(userText || '').toLowerCase();

  const isTrunkQuestion =
    text.includes('транк') ||
    text.includes('trunk') ||
    text.includes('регистрац') ||
    text.includes('оператор связи') ||
    text.includes('провайдер') ||
    text.includes('исходящ') ||
    text.includes('входящ') ||
    text.includes('не звонит') ||
    text.includes('нет звонк') ||
    text.includes('проверь все ли') ||
    text.includes('на связи');

  if (!isTrunkQuestion) return null;

  const commands = [
    { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
    { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
    { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
    { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] }
  ];

  const run = (item: any) => {
    return new Promise<any>((resolve) => {
      execFile(item.cmd, item.args, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        resolve({
          title: item.title,
          command: [item.cmd, ...item.args].join(' '),
          ok: !error,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: error ? String(error.message || error) : ''
        });
      });
    });
  };

  const results = [];
  for (const item of commands) {
    results.push(await run(item));
  }

  const trunkOk: string[] = [];
  const trunkProblems: string[] = [];
  const internalOffline: string[] = [];
  const pjsipInternalUnavailable: string[] = [];

  for (const r of results) {
    const lines = String((r.stdout || '') + '\\n' + (r.stderr || '') + '\\n' + (r.error || ''))
      .split(/\\r?\\n/)
      .map((x: string) => x.trim())
      .filter(Boolean);

    for (const line of lines) {
      const low = line.toLowerCase();

      if (low.includes('registered') && !low.includes('endpoint:')) {
        trunkOk.push(line);
      }

      if (
        low.includes('rejected') ||
        low.includes('timeout') ||
        low.includes('request sent') ||
        low.includes('no authentication') ||
        low.includes('failed')
      ) {
        trunkProblems.push(line);
      }

      if (/^\\d+\\s+\\(unspecified\\)/i.test(line) || (/^\\d+\\//i.test(line) && low.includes('unknown'))) {
        internalOffline.push(line);
      }

      if (low.startsWith('endpoint:') && low.includes('unavailable')) {
        pjsipInternalUnavailable.push(line);
      }
    }
  }

  let answer = '';

  if (trunkProblems.length) {
    answer += 'По локальной диагностике есть признаки проблем с SIP/PJSIP транками или регистрациями.\\n\\n';
  } else if (trunkOk.length) {
    answer += 'Транки выглядят рабочими: есть успешная SIP-регистрация, критичных ошибок по транкам не найдено.\\n\\n';
  } else {
    answer += 'Явной успешной регистрации SIP/PJSIP транка не найдено. Нужно проверить, используются ли транки на этой АТС и по какой технологии: chan_sip или pjsip.\\n\\n';
  }

  if (trunkOk.length) {
    answer += 'Рабочие регистрации / транки:\\n';
    answer += trunkOk.slice(0, 20).map(x => '- ' + x).join('\\n') + '\\n\\n';
  }

  if (trunkProblems.length) {
    answer += 'Проблемные строки по транкам:\\n';
    answer += trunkProblems.slice(0, 30).map(x => '- ' + x).join('\\n') + '\\n\\n';
  }

  if (internalOffline.length) {
    answer += 'Отдельно вижу незарегистрированные внутренние SIP-номера. Это не обязательно проблема транков:\\n';
    answer += internalOffline.slice(0, 30).map(x => '- ' + x).join('\\n') + '\\n\\n';
  }

  if (pjsipInternalUnavailable.length) {
    answer += 'Отдельно вижу недоступные PJSIP endpoint, вероятно внутренние номера:\\n';
    answer += pjsipInternalUnavailable.slice(0, 20).map(x => '- ' + x).join('\\n') + '\\n\\n';
  }

  answer += 'Я самостоятельно выбрал и выполнил локальные команды диагностики:\\n';
  answer += '- asterisk -rx "pjsip show registrations"\\n';
  answer += '- asterisk -rx "pjsip show endpoints"\\n';
  answer += '- asterisk -rx "sip show registry"\\n';
  answer += '- asterisk -rx "sip show peers"\\n\\n';

  answer += 'Вывод команд:\\n\\n';

  for (const r of results) {
    answer += '### ' + r.title + '\\n';
    answer += '$ ' + r.command + '\\n';
    if (r.error) answer += 'ERROR: ' + r.error + '\\n';
    if (r.stderr) answer += 'STDERR:\\n' + r.stderr.slice(0, 2000) + '\\n';
    answer += 'STDOUT:\\n' + (r.stdout || 'пусто').slice(0, 12000) + '\\n\\n';
  }

  return answer.slice(0, 24000);
}

`;

  s = s.replace(marker, helper + marker);
}

// 3. Вставляем стабильный перехват сразу после session.messages.push(userMsg);
if (!s.includes('STABLE_LOCAL_TRUNKS_INTERCEPT_V1')) {
  const pushMarker = 'session.messages.push(userMsg);';
  const idx = s.indexOf(pushMarker);

  if (idx === -1) {
    console.error('Не найден session.messages.push(userMsg);');
    process.exit(1);
  }

  const insertAt = idx + pushMarker.length;

  const intercept = `

      // STABLE_LOCAL_TRUNKS_INTERCEPT_V1
      const stableLocalAnswer = await runStableLocalTrunksDiagnostic(text);
      if (stableLocalAnswer) {
        const assistantMsg = {
          id: 'msg_' + crypto.randomBytes(6).toString('hex'),
          role: 'assistant',
          text: stableLocalAnswer,
          timestamp: new Date().toISOString()
        };

        session.messages = Array.isArray(session.messages)
          ? session.messages.filter((m: any) => m && typeof m === 'object' && typeof m.role === 'string')
          : [];

        session.messages.push(userMsg);
        session.messages.push(assistantMsg);
        session.updatedAt = new Date().toISOString();

        await writeLocalDb(db);

        return res.json({
          success: true,
          message: assistantMsg,
          session
        });
      }
`;

  s = s.slice(0, insertAt) + intercept + s.slice(insertAt);
}

// 4. Защита от двойного добавления userMsg в локальном перехвате:
// если получилось session.messages.push(userMsg); потом внутри перехвата еще раз push(userMsg),
// удаляем первый push только для участка перед STABLE_LOCAL_TRUNKS_INTERCEPT_V1
s = s.replace(
  /session\.messages\.push\(userMsg\);\s*\n\s*\/\/ STABLE_LOCAL_TRUNKS_INTERCEPT_V1/,
  `// STABLE_LOCAL_TRUNKS_INTERCEPT_V1`
);

fs.writeFileSync(file, s);

console.log('OK: стабильная локальная диагностика транков подключена до OpenAI.');
