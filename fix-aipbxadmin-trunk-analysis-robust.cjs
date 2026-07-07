const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-trunk-analysis-robust';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const start1 = s.indexOf('  const problemWords');
const start2 = s.indexOf('  const trunkProblems');

let start = -1;
if (start1 !== -1) start = start1;
if (start2 !== -1 && (start === -1 || start2 < start)) start = start2;

const endMarker = "  answer += 'Вывод команд:";
const end = s.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  console.error('Не нашел участок анализа транков.');
  console.log({
    foundProblemWords: start1 !== -1,
    foundTrunkProblems: start2 !== -1,
    foundEndMarker: end !== -1
  });
  process.exit(1);
}

const newBlock = `  const trunkProblems: string[] = [];
  const trunkOk: string[] = [];
  const extensionOffline: string[] = [];
  const pjsipUnavailable: string[] = [];

  for (const r of results) {
    const out = String((r.stdout || '') + '\\\\n' + (r.stderr || '') + '\\\\n' + (r.error || ''));
    const lines = out.split(/\\\\r?\\\\n/).map(x => x.trim()).filter(Boolean);

    for (const line of lines) {
      const low = line.toLowerCase();

      // Реальная регистрация провайдера из "sip show registry"
      if (low.includes('registered') && !low.includes('endpoint:')) {
        trunkOk.push(line);
      }

      // Реальные проблемы регистрации/транка
      if (
        low.includes('rejected') ||
        low.includes('timeout') ||
        low.includes('request sent') ||
        low.includes('no authentication') ||
        low.includes('failed')
      ) {
        trunkProblems.push(line);
      }

      // Внутренние SIP-номера offline/UNKNOWN — не считаем проблемой транка
      if (
        /^\\\\d+\\\\s+\\\\(unspecified\\\\)/i.test(line) ||
        (/^\\\\d+\\\\//i.test(line) && low.includes('unknown'))
      ) {
        extensionOffline.push(line);
      }

      // PJSIP endpoint unavailable — отдельно, чаще это внутренний номер
      if (low.startsWith('endpoint:') && low.includes('unavailable')) {
        pjsipUnavailable.push(line);
      }
    }
  }

  let answer = '';

  if (preset === 'trunks') {
    if (trunkProblems.length) {
      answer += 'По локальной диагностике есть проблемы с SIP/PJSIP регистрациями или транками.\\\\n\\\\n';
    } else if (trunkOk.length) {
      answer += 'Внешний SIP-транк выглядит рабочим: регистрация есть, критичных ошибок по транкам не найдено.\\\\n\\\\n';
    } else {
      answer += 'Явных зарегистрированных SIP/PJSIP транков не найдено. Нужно проверить, используются ли транки на этой АТС и по какой технологии: chan_sip или pjsip.\\\\n\\\\n';
    }

    if (trunkOk.length) {
      answer += 'Рабочие регистрации / транки:\\\\n';
      answer += trunkOk.slice(0, 20).map(x => '- ' + x).join('\\\\n') + '\\\\n\\\\n';
    }

    if (trunkProblems.length) {
      answer += 'Проблемные строки по транкам/регистрациям:\\\\n';
      answer += trunkProblems.slice(0, 30).map(x => '- ' + x).join('\\\\n') + '\\\\n\\\\n';
    }

    if (extensionOffline.length) {
      answer += 'Отдельно: есть незарегистрированные внутренние SIP-номера. Это не обязательно проблема транков:\\\\n';
      answer += extensionOffline.slice(0, 30).map(x => '- ' + x).join('\\\\n') + '\\\\n\\\\n';
    }

    if (pjsipUnavailable.length) {
      answer += 'Отдельно: есть недоступные PJSIP endpoint, вероятно внутренние номера:\\\\n';
      answer += pjsipUnavailable.slice(0, 20).map(x => '- ' + x).join('\\\\n') + '\\\\n\\\\n';
    }

    answer += 'Я сам выбрал диагностику транков по вашему вопросу. Проверены команды: pjsip show registrations, pjsip show endpoints, sip show registry, sip show peers.\\\\n\\\\n';
  } else {
    answer += 'Выполнена локальная диагностика: ' + preset + '.\\\\n\\\\n';
  }

`;

s = s.slice(0, start) + newBlock + s.slice(end);

fs.writeFileSync(file, s);

console.log('OK: анализ транков обновлен надежным способом.');
