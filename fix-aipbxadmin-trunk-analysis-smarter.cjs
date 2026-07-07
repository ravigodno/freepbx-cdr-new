const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-trunk-analysis-smarter';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const oldBlock = `  const problemWords = [
    'unreachable',
    'rejected',
    'timeout',
    'failed',
    'offline',
    'nonqual',
    'request sent',
    'no authentication'
  ];

  const problems: string[] = [];

  for (const r of results) {
    const out = String((r.stdout || '') + '\\\\n' + (r.stderr || '') + '\\\\n' + (r.error || ''));
    const lines = out.split(/\\\\r?\\\\n/);
    for (const line of lines) {
      const low = line.toLowerCase();
      if (problemWords.some(w => low.includes(w))) {
        problems.push(line.trim());
      }
    }
  }

  let answer = '';

  if (preset === 'trunks') {
    answer += problems.length
      ? 'По локальной диагностике есть проблемные SIP/PJSIP транки или регистрации.\\\\n\\\\n'
      : 'По локальной диагностике явных проблемных статусов по транкам не найдено.\\\\n\\\\n';

    if (problems.length) {
      answer += 'Проблемные строки:\\\\n';
      answer += problems.slice(0, 30).map(x => '- ' + x).join('\\\\n') + '\\\\n\\\\n';
    }

    answer += 'Я сам выбрал диагностику транков по вашему вопросу. Проверены команды: pjsip show registrations, pjsip show endpoints, sip show registry, sip show peers.\\\\n\\\\n';
  } else {
    answer += 'Выполнена локальная диагностика: ' + preset + '.\\\\n\\\\n';
  }`;

const newBlock = `  const trunkProblems: string[] = [];
  const trunkOk: string[] = [];
  const extensionOffline: string[] = [];
  const pjsipUnavailable: string[] = [];

  for (const r of results) {
    const out = String((r.stdout || '') + '\\\\n' + (r.stderr || '') + '\\\\n' + (r.error || ''));
    const lines = out.split(/\\\\r?\\\\n/).map(x => x.trim()).filter(Boolean);

    for (const line of lines) {
      const low = line.toLowerCase();

      // SIP registry: это реальные регистрации провайдера
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

      // sip show peers: внутренние номера обычно Dyn и Unspecified
      if (
        /^\\\\d+\\\\s+\\\\(unspecified\\\\)/i.test(line) ||
        /^\\\\d+\\\\/i.test(line) && low.includes('unknown')
      ) {
        extensionOffline.push(line);
      }

      // PJSIP endpoint unavailable — чаще внутренний номер, отдельно от транков
      if (low.startsWith('endpoint:') && low.includes('unavailable')) {
        pjsipUnavailable.push(line);
      }

      // Не считаем summary "7 sip peers ... offline" проблемой транка
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
  }`;

if (!s.includes(oldBlock)) {
  console.error('Не нашел старый блок анализа problemWords. Патч не применен.');
  process.exit(1);
}

s = s.replace(oldBlock, newBlock);

fs.writeFileSync(file, s);

console.log('OK: анализ транков стал умнее — offline extensions больше не считаются проблемой транков.');
