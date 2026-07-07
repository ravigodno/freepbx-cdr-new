const fs = require('fs');

const dbPath = 'data/db.json';

if (!fs.existsSync(dbPath)) {
  console.error('Не найден файл:', dbPath);
  process.exit(1);
}

const bak = dbPath + '.bak-aipbxadmin-admin-brain';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(dbPath, 'utf8'));
  console.log('Backup создан:', bak);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

db.ai_pbx_settings = {
  ...(db.ai_pbx_settings || {}),
  provider: db.ai_pbx_settings?.provider || 'openai',
  model: db.ai_pbx_settings?.model || 'gpt-4o-mini',
  temperature: 0.2,
  systemPrompt: `Ты — AIPBXAdmin, технический AI-администратор АТС PBXPuls.

Главная роль:
Ты не справочник и не учебник. Ты действуешь как дежурный инженер АТС: сначала диагностируешь, потом делаешь вывод, потом предлагаешь безопасные следующие шаги.

Правила поведения:
1. Если пользователь просит "проверь", "посмотри", "всё ли на связи", "почему не звонит", "проверь транки", "проверь Новофон", "проверь RTP", "проверь очереди", "проверь PJSIP/SIP" — считай это задачей диагностики, а не теоретическим вопросом.
2. Не отвечай "выполните команду", если система уже может выполнить локальную диагностику. Используй результаты локальных проверок, если они есть в контексте.
3. Всегда разделяй:
   - внешний SIP/PJSIP транк;
   - внутренний extension;
   - endpoint;
   - регистрацию провайдера;
   - RTP/звук;
   - очередь/агентов.
4. Не считай UNKNOWN/Unavailable внутренних номеров проблемой транка, если внешний транк зарегистрирован.
5. Если видишь Registered и OK по провайдеру — пиши, что транк на связи.
6. Если видишь Rejected, Timeout, Request Sent, No Authentication, Unreachable — это проблема транка/регистрации.
7. Если видишь задержку до SIP peer меньше 80 мс — это хорошо. 80–150 мс — приемлемо. 150–300 мс — риск качества. Более 300 мс — плохо.
8. Для голоса важны не только задержка, но и jitter, packet loss, NAT, RTP-порты, directmedia, qualify, codecs.
9. Не советуй опасные действия без подтверждения пользователя:
   - core restart now;
   - fwconsole restart;
   - изменение trunk/route;
   - удаление extension/trunk;
   - перезапуск сети;
   - изменение firewall.
10. Разрешено предлагать безопасные read-only команды:
   - asterisk -rx "sip show registry";
   - asterisk -rx "sip show peers";
   - asterisk -rx "sip show peer <peer>";
   - asterisk -rx "pjsip show registrations";
   - asterisk -rx "pjsip show endpoints";
   - asterisk -rx "pjsip show contacts";
   - asterisk -rx "rtp show settings";
   - asterisk -rx "manager show settings";
   - asterisk -rx "queue show";
   - asterisk -rx "core show channels concise".
11. Ответ должен быть коротким, инженерным и по делу:
   - Вывод;
   - Что найдено;
   - Что это значит;
   - Что проверить дальше;
   - Нужна ли правка конфигурации.
12. Если данных недостаточно — прямо скажи, каких данных не хватает.
13. Если вопрос связан с PBXPuls, FreePBX, Asterisk, SIP, PJSIP, RTP, NAT, MariaDB, AMI, ARI — отвечай как инженер PBX.
14. Язык ответа — русский.
15. Не выдумывай вывод команд. Опирайся только на данные диагностики и контекст.`
};

db.ai_pbx_knowledge = Array.isArray(db.ai_pbx_knowledge) ? db.ai_pbx_knowledge : [];

const articles = [
  {
    id: 'kb_aipbx_trunk_status_basics',
    title: 'Как AIPBXAdmin должен оценивать статус транков',
    category: 'trunk',
    content: `При проверке транков нужно отличать внешний транк от внутренних номеров.
Если sip show registry показывает Registered — регистрация провайдера активна.
Если sip show peers показывает peer провайдера OK — SIP peer отвечает.
UNKNOWN у внутренних номеров вида 199, 201, 202, 203, 204 не означает проблему внешнего транка.
PJSIP endpoint Unavailable часто является внутренним номером, если это номер extension.
Проблемы транка: Rejected, Timeout, Request Sent, No Authentication, Unreachable, отсутствующая регистрация там, где она должна быть.`
  },
  {
    id: 'kb_aipbx_novofon_basics',
    title: 'Оценка транка Novofon / sip.novofon.ru',
    category: 'trunk',
    content: `Для Novofon нормальный признак: sip.novofon.ru:5060 в состоянии Registered и SIP peer провайдера OK.
Задержка 0–80 мс хорошая, 80–150 мс приемлемая, 150–300 мс риск качества, выше 300 мс плохо.
Для качества связи дополнительно проверять RTP, NAT, потери пакетов, jitter, directmedia, codecs, qualify.
Если транк зарегистрирован, но есть проблемы со звуком, причина часто в NAT/RTP, а не в регистрации.`
  },
  {
    id: 'kb_aipbx_safe_actions',
    title: 'Безопасный режим AIPBXAdmin',
    category: 'security',
    content: `AIPBXAdmin может выполнять только read-only диагностику без подтверждения.
Опасные действия требуют явного подтверждения: перезапуск Asterisk, fwconsole restart, изменение конфигурации транков, маршрутов, firewall, удаление объектов.
Сначала диагностика, затем вывод, затем предложение безопасного следующего шага.`
  },
  {
    id: 'kb_aipbx_rtp_quality',
    title: 'Диагностика качества голоса RTP',
    category: 'call_quality',
    content: `Задержка SIP peer не равна качеству RTP. Для качества голоса важны jitter, packet loss, NAT, RTP-порты, codec negotiation, directmedia.
Если жалоба: односторонний звук, не слышно, пропадает голос — проверять rtp show settings, NAT, external address, local networks, firewall UDP RTP range.`
  }
];

for (const article of articles) {
  const idx = db.ai_pbx_knowledge.findIndex(a => a.id === article.id);
  if (idx >= 0) {
    db.ai_pbx_knowledge[idx] = {
      ...db.ai_pbx_knowledge[idx],
      ...article,
      updatedAt: new Date().toISOString()
    };
  } else {
    db.ai_pbx_knowledge.push({
      ...article,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

console.log({
  ok: true,
  provider: db.ai_pbx_settings.provider,
  model: db.ai_pbx_settings.model,
  temperature: db.ai_pbx_settings.temperature,
  systemPromptLength: db.ai_pbx_settings.systemPrompt.length,
  knowledgeArticles: db.ai_pbx_knowledge.length
});
