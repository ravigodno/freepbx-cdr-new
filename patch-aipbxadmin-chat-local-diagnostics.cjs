const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-chat-local-diagnostics';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (s.includes('LOCAL_DIAGNOSTIC_CHAT_PATCH_V1')) {
  console.log('Патч локальной диагностики в чате уже установлен');
  process.exit(0);
}

const marker = 'async function generateAIResponse';

if (!s.includes(marker)) {
  console.error('Не найден generateAIResponse');
  process.exit(1);
}

const helper = `
// LOCAL_DIAGNOSTIC_CHAT_PATCH_V1
async function runLocalAsteriskDiagnosticFromChat(userText: string): Promise<string | null> {
  const { execFile } = require('child_process');

  const text = String(userText || '').trim().toLowerCase();

  let preset = '';

  if (text === 'trunks' || text.includes('транк') || text.includes('trunk') || text.includes('все ли транки') || text.includes('транки на связи')) {
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
  }

  if (!preset) return null;

  const presets: Record<string, Array<{ title: string; cmd: string; args: string[] }>> = {
    trunks: [
      { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
      { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
      { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
      { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] }
    ],
    sip: [
      { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
      { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] }
    ],
    pjsip: [
      { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
      { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
      { title: 'PJSIP contacts', cmd: 'asterisk', args: ['-rx', 'pjsip show contacts'] }
    ],
    queues: [
      { title: 'Queues', cmd: 'asterisk', args: ['-rx', 'queue show'] }
    ],
    channels: [
      { title: 'Active channels', cmd: 'asterisk', args: ['-rx', 'core show channels concise'] }
    ],
    rtp: [
      { title: 'RTP settings', cmd: 'asterisk', args: ['-rx', 'rtp show settings'] }
    ],
    ami: [
      { title: 'AMI settings', cmd: 'asterisk', args: ['-rx', 'manager show settings'] }
    ]
  };

  const run = (item: { title: string; cmd: string; args: string[] }) => {
    return new Promise<any>((resolve) => {
      execFile(item.cmd, item.args, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        resolve({
          title: item.title,
          command: [item.cmd, ...item.args].join(' '),
          ok: !error,
          stdout: String(stdout || '').slice(0, 12000),
          stderr: String(stderr || '').slice(0, 2000),
          error: error ? String(error.message || error).slice(0, 800) : ''
        });
      });
    });
  };

  const results = [];
  for (const item of presets[preset]) {
    results.push(await run(item));
  }

  const problemWords = [
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
    const out = String((r.stdout || '') + '\\n' + (r.stderr || '') + '\\n' + (r.error || ''));
    const lines = out.split(/\\r?\\n/);
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
      ? 'По локальной диагностике есть проблемные SIP/PJSIP транки или регистрации.\\n\\n'
      : 'По локальной диагностике явных проблемных статусов по транкам не найдено.\\n\\n';

    if (problems.length) {
      answer += 'Проблемные строки:\\n';
      answer += problems.slice(0, 30).map(x => '- ' + x).join('\\n') + '\\n\\n';
    }

    answer += 'Проверены команды: pjsip show registrations, pjsip show endpoints, sip show registry, sip show peers.\\n\\n';
  } else {
    answer += 'Выполнена локальная диагностика: ' + preset + '.\\n\\n';
  }

  answer += 'Вывод команд:\\n\\n';

  for (const r of results) {
    answer += '### ' + r.title + '\\n';
    answer += '$ ' + r.command + '\\n';
    if (r.error) answer += 'ERROR: ' + r.error + '\\n';
    if (r.stderr) answer += 'STDERR:\\n' + r.stderr + '\\n';
    answer += 'STDOUT:\\n' + (r.stdout || 'пусто') + '\\n\\n';
  }

  return answer.slice(0, 24000);
}

`;

s = s.replace(marker, helper + marker);

// Вставляем перехват перед первым вызовом generateAIResponse в обработчике сообщений
const routeMarker = "app.post('/api/ai-pbx-admin/sessions/:id/messages'";
const routeStart = s.indexOf(routeMarker);

if (routeStart === -1) {
  console.error('Не найден route sessions/:id/messages');
  process.exit(1);
}

const firstGenerateAfterRoute = s.indexOf('generateAIResponse', routeStart);

if (firstGenerateAfterRoute === -1) {
  console.error('Не найден вызов generateAIResponse после route');
  process.exit(1);
}

const insertPoint = s.lastIndexOf('\n', firstGenerateAfterRoute);

const intercept = `
      const localDiagnosticAnswer = await runLocalAsteriskDiagnosticFromChat(content || message || text || '');
      if (localDiagnosticAnswer) {
        const assistantMessage = {
          id: 'msg_' + Date.now() + '_local_diag',
          role: 'assistant',
          content: localDiagnosticAnswer,
          timestamp: new Date().toISOString()
        };

        session.messages.push(assistantMessage);
        session.updatedAt = new Date().toISOString();
        await writeLocalDb(db);

        return res.json({
          success: true,
          message: assistantMessage,
          session
        });
      }

`;

s = s.slice(0, insertPoint + 1) + intercept + s.slice(insertPoint + 1);

fs.writeFileSync(file, s);

console.log('OK: команды trunks/sip/pjsip/queues/channels/rtp/ami теперь обрабатываются локально в чате.');
