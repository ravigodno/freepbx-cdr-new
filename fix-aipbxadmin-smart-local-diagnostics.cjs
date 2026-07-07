const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-smart-local-diagnostics';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

// 1. Убираем ошибочную строку с content/message/text
s = s.replace(
  /const localDiagnosticAnswer = await runLocalAsteriskDiagnosticFromChat\(content \|\| message \|\| text \|\| ''\);/g,
  `const userDiagnosticText = String(req.body?.content || req.body?.message || req.body?.text || req.body?.prompt || '');
      const localDiagnosticAnswer = await runLocalAsteriskDiagnosticFromChat(userDiagnosticText);`
);

// 2. Расширяем локальный выбор диагностики по обычным фразам
const oldClassifier = `  if (text === 'trunks' || text.includes('транк') || text.includes('trunk') || text.includes('все ли транки') || text.includes('транки на связи')) {
    preset = 'trunks';
  } else if (text === 'sip' || text.includes('chan sip')) {
    preset = 'sip';
  } else if (text === 'pjsip' || text.includes('пжсип')) {
    preset = 'pjsip';
  } else if (text === 'queues' || text.includes('очеред')) {
    preset = 'queues';
  } else if (text === 'channels' || text.includes('канал')) {
    preset = 'channels';
  } else if (text === 'rtp' || text.includes('ртп')) {
    preset = 'rtp';
  } else if (text === 'ami' || text.includes('manager')) {
    preset = 'ami';
  }`;

const newClassifier = `  // Умный локальный выбор диагностики по смыслу вопроса.
  // Без OpenAI: только безопасный whitelist команд.
  if (
    text === 'trunks' ||
    text.includes('транк') ||
    text.includes('trunk') ||
    text.includes('регистрац') ||
    text.includes('registered') ||
    text.includes('исходящ') ||
    text.includes('входящ') ||
    text.includes('нет звонк') ||
    text.includes('не звонит') ||
    text.includes('не проходят звонки') ||
    text.includes('оператор связи') ||
    text.includes('провайдер связи')
  ) {
    preset = 'trunks';
  } else if (
    text === 'pjsip' ||
    text.includes('пжсип') ||
    text.includes('pj sip') ||
    text.includes('endpoint') ||
    text.includes('contact')
  ) {
    preset = 'pjsip';
  } else if (
    text === 'sip' ||
    text.includes('chan sip') ||
    text.includes('sip peer') ||
    text.includes('sip registry')
  ) {
    preset = 'sip';
  } else if (
    text === 'queues' ||
    text.includes('очеред') ||
    text.includes('queue') ||
    text.includes('оператор') ||
    text.includes('агент')
  ) {
    preset = 'queues';
  } else if (
    text === 'channels' ||
    text.includes('канал') ||
    text.includes('активные звонки') ||
    text.includes('сейчас звон') ||
    text.includes('зависшие звонки')
  ) {
    preset = 'channels';
  } else if (
    text === 'rtp' ||
    text.includes('ртп') ||
    text.includes('звук') ||
    text.includes('односторон') ||
    text.includes('не слышно') ||
    text.includes('нет голоса')
  ) {
    preset = 'rtp';
  } else if (
    text === 'ami' ||
    text.includes('manager') ||
    text.includes('ами') ||
    text.includes('5038')
  ) {
    preset = 'ami';
  }`;

if (s.includes(oldClassifier)) {
  s = s.replace(oldClassifier, newClassifier);
  console.log('Классификатор диагностических задач обновлен.');
} else {
  console.log('Старый классификатор не найден — возможно уже изменен.');
}

// 3. Делаем ответ более понятным
s = s.replace(
  `answer += 'Проверены команды: pjsip show registrations, pjsip show endpoints, sip show registry, sip show peers.\\\\n\\\\n';`,
  `answer += 'Я сам выбрал диагностику транков по вашему вопросу. Проверены команды: pjsip show registrations, pjsip show endpoints, sip show registry, sip show peers.\\\\n\\\\n';`
);

fs.writeFileSync(file, s);

console.log('OK: AI-админ теперь сам выбирает локальную диагностику по тексту задачи.');
