const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-safe-diagnostic-console';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (s.includes("/api/ai-pbx-admin/diagnostics/console")) {
  console.log('Safe diagnostic console endpoint уже есть');
  process.exit(0);
}

const marker = "  // 16. Get AIPBXAdmin Settings";

if (!s.includes(marker)) {
  console.error('Не найден маркер:', marker);
  process.exit(1);
}

const endpoint = `
  // 15.2 Safe diagnostic console
  app.post('/api/ai-pbx-admin/diagnostics/console', aiPbxAuth, async (req: Request, res: Response) => {
    const { execFile } = require('child_process');

    const rawCommand = String(req.body?.command || '').trim().toLowerCase();

    const presets: Record<string, Array<{ title: string; cmd: string; args: string[] }>> = {
      'trunks': [
        { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
        { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
        { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
        { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] }
      ],
      'sip': [
        { title: 'Chan SIP registry', cmd: 'asterisk', args: ['-rx', 'sip show registry'] },
        { title: 'Chan SIP peers', cmd: 'asterisk', args: ['-rx', 'sip show peers'] }
      ],
      'pjsip': [
        { title: 'PJSIP registrations', cmd: 'asterisk', args: ['-rx', 'pjsip show registrations'] },
        { title: 'PJSIP endpoints', cmd: 'asterisk', args: ['-rx', 'pjsip show endpoints'] },
        { title: 'PJSIP contacts', cmd: 'asterisk', args: ['-rx', 'pjsip show contacts'] }
      ],
      'channels': [
        { title: 'Active channels', cmd: 'asterisk', args: ['-rx', 'core show channels concise'] }
      ],
      'queues': [
        { title: 'Queues', cmd: 'asterisk', args: ['-rx', 'queue show'] }
      ],
      'ami': [
        { title: 'AMI settings', cmd: 'asterisk', args: ['-rx', 'manager show settings'] }
      ],
      'rtp': [
        { title: 'RTP settings', cmd: 'asterisk', args: ['-rx', 'rtp show settings'] }
      ]
    };

    let presetKey = rawCommand;

    if (rawCommand.includes('транк') || rawCommand.includes('trunk')) presetKey = 'trunks';
    if (rawCommand.includes('очеред')) presetKey = 'queues';
    if (rawCommand.includes('канал')) presetKey = 'channels';
    if (rawCommand.includes('pjsip')) presetKey = 'pjsip';
    if (rawCommand.includes('sip')) presetKey = 'sip';
    if (rawCommand.includes('ami')) presetKey = 'ami';
    if (rawCommand.includes('rtp')) presetKey = 'rtp';

    const selected = presets[presetKey];

    if (!selected) {
      return res.status(400).json({
        success: false,
        error: 'Команда не разрешена',
        allowed: Object.keys(presets),
        hint: 'Например: trunks, sip, pjsip, channels, queues, ami, rtp'
      });
    }

    const run = (item: { title: string; cmd: string; args: string[] }) => {
      return new Promise((resolve) => {
        execFile(item.cmd, item.args, { timeout: 10000, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
          resolve({
            title: item.title,
            command: [item.cmd, ...item.args].join(' '),
            ok: !error,
            stdout: String(stdout || '').slice(0, 20000),
            stderr: String(stderr || '').slice(0, 4000),
            error: error ? String(error.message || error).slice(0, 1000) : null
          });
        });
      });
    };

    const results = [];
    for (const item of selected) {
      results.push(await run(item));
    }

    res.json({
      success: true,
      requested: rawCommand,
      preset: presetKey,
      results
    });
  });

`;

s = s.replace(marker, endpoint + marker);
fs.writeFileSync(file, s);

console.log('OK: добавлена безопасная диагностическая консоль.');
