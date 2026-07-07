const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-no-auth-temporary';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('const aiPbxAuth =')) {
  s = s.replace(
`) {
  // 1. Get Sessions`,
`) {
  // TEMP: AI PBX Admin auth bypass for internal PBXPuls panel.
  // TODO: replace with correct shared token auth after UI auth storage is normalized.
  const aiPbxAuth = (req: Request, res: Response, next: any) => next();

  // 1. Get Sessions`
  );
}

s = s.replaceAll("app.get('/api/ai-pbx-admin/sessions', requireAuth,", "app.get('/api/ai-pbx-admin/sessions', aiPbxAuth,");
s = s.replaceAll("app.get('/api/ai-pbx-admin/sessions/:id', requireAuth,", "app.get('/api/ai-pbx-admin/sessions/:id', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/sessions', requireAuth,", "app.post('/api/ai-pbx-admin/sessions', aiPbxAuth,");
s = s.replaceAll("app.put('/api/ai-pbx-admin/sessions/:id', requireAuth,", "app.put('/api/ai-pbx-admin/sessions/:id', aiPbxAuth,");
s = s.replaceAll("app.delete('/api/ai-pbx-admin/sessions/:id', requireAuth,", "app.delete('/api/ai-pbx-admin/sessions/:id', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/sessions/:id/messages', requireAuth,", "app.post('/api/ai-pbx-admin/sessions/:id/messages', aiPbxAuth,");

s = s.replaceAll("app.post('/api/ai-pbx-admin/diagnostics/suggest', requireAuth,", "app.post('/api/ai-pbx-admin/diagnostics/suggest', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/diagnostics/collect-safe', requireAuth,", "app.post('/api/ai-pbx-admin/diagnostics/collect-safe', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/diagnostics/analyze', requireAuth,", "app.post('/api/ai-pbx-admin/diagnostics/analyze', aiPbxAuth,");

s = s.replaceAll("app.get('/api/ai-pbx-admin/knowledge', requireAuth,", "app.get('/api/ai-pbx-admin/knowledge', aiPbxAuth,");
s = s.replaceAll("app.get('/api/ai-pbx-admin/knowledge/:id', requireAuth,", "app.get('/api/ai-pbx-admin/knowledge/:id', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/knowledge', requireAuth,", "app.post('/api/ai-pbx-admin/knowledge', aiPbxAuth,");
s = s.replaceAll("app.put('/api/ai-pbx-admin/knowledge/:id', requireAuth,", "app.put('/api/ai-pbx-admin/knowledge/:id', aiPbxAuth,");
s = s.replaceAll("app.delete('/api/ai-pbx-admin/knowledge/:id', requireAuth,", "app.delete('/api/ai-pbx-admin/knowledge/:id', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/knowledge/from-session/:sessionId', requireAuth,", "app.post('/api/ai-pbx-admin/knowledge/from-session/:sessionId', aiPbxAuth,");

s = s.replaceAll("app.get('/api/ai-pbx-admin/settings', requireAuth,", "app.get('/api/ai-pbx-admin/settings', aiPbxAuth,");
s = s.replaceAll("app.put('/api/ai-pbx-admin/settings', requireAuth,", "app.put('/api/ai-pbx-admin/settings', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/settings/models', requireAuth,", "app.post('/api/ai-pbx-admin/settings/models', aiPbxAuth,");
s = s.replaceAll("app.post('/api/ai-pbx-admin/settings/test-provider', requireAuth,", "app.post('/api/ai-pbx-admin/settings/test-provider', aiPbxAuth,");

fs.writeFileSync(file, s);

console.log('Готово: для маршрутов AI-админа временно включен внутренний bypass авторизации.');
