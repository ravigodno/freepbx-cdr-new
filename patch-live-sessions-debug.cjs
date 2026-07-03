const fs = require('fs');

const path = 'server.ts';
let s = fs.readFileSync(path, 'utf8');

const oldText = `    const sessions = channels.success ? parseCoreShowChannelsConcise(channels.message) : [];

    const summary = {`;

const newText = `    const sessions = channels.success ? parseCoreShowChannelsConcise(channels.message) : [];

    console.log('[LIVE_SESSIONS_DEBUG]', {
      channelsSuccess: channels.success,
      rawLength: String(channels.message || '').length,
      sessionsCount: sessions.length,
      firstRawLine: String(channels.message || '').split(/\\\\r?\\\\n/).find(line => line.includes('!')) || '',
      firstSession: sessions[0] || null
    });

    const summary = {`;

if (!s.includes(oldText)) {
  console.error('Не найден блок sessions в /api/live-sessions');
  process.exit(1);
}

s = s.replace(oldText, newText);
fs.writeFileSync(path, s);

console.log('OK: live sessions debug inserted');
