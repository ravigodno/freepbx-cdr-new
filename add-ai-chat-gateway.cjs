const fs = require('fs');

const file = 'server/aiPbxAdmin.ts';
let s = fs.readFileSync(file, 'utf8');

if (s.includes("/api/ai-pbx-admin/chat")) {
  console.log("chat endpoint already exists");
  process.exit(0);
}

const endpoint = `

// ===== PBXPULS CHAT GATEWAY (AUTO FIX) =====
app.post('/api/ai-pbx-admin/chat', aiPbxAuth, async (req, res) => {
  try {
    const db = await readLocalDb();
    const settings = db.ai_pbx_settings || {};

    const message = req.body.message || '';

    if (!Array.isArray(db.ai_pbx_sessions)) db.ai_pbx_sessions = [];

    // create session if none
    let session = db.ai_pbx_sessions[db.ai_pbx_sessions.length - 1];

    if (!session) {
      session = {
        id: 'session_' + Date.now(),
        title: 'Auto Chat',
        status: 'open',
        messages: [],
        createdAt: new Date().toISOString()
      };
      db.ai_pbx_sessions.push(session);
    }

    session.messages.push({
      role: 'user',
      text: message,
      createdAt: new Date().toISOString()
    });

    const aiText = await generateAIResponse({
      provider: settings.provider || 'openai',
      model: settings.model || 'gpt-4o-mini',
      apiKey: settings.apiKey || '',
      systemPrompt: settings.systemPrompt || 'You are PBXPuls AI assistant',
      messages: session.messages.map(m => ({
        role: m.role,
        text: m.text
      }))
    });

    session.messages.push({
      role: 'assistant',
      text: aiText,
      createdAt: new Date().toISOString()
    });

    await writeLocalDb(db);

    res.json({
      success: true,
      response: aiText,
      sessionId: session.id
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
`;

s += endpoint;

fs.writeFileSync(file, s);
console.log("chat gateway added");
