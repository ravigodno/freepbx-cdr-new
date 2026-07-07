const fs = require('fs');

const file = 'src/components/AIPBXAdminTab.tsx';

if (!fs.existsSync(file)) {
  console.error('Не найден файл:', file);
  process.exit(1);
}

const bak = file + '.bak-send-update-session';
if (!fs.existsSync(bak)) {
  fs.writeFileSync(bak, fs.readFileSync(file, 'utf8'));
  console.log('Backup создан:', bak);
}

let s = fs.readFileSync(file, 'utf8');

const oldBlock = `      if (res.ok) {
        const data = await res.json();
        // Update both in list and active select
        setSessions(prev => prev.map(s => {
          if (s.id === selectedSession.id) {
            return {
              ...s,
              messages: [...s.messages, data.userMessage, data.aiMessage]
            };
          }
          return s;
        }));
        setSelectedSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            messages: [...prev.messages, data.userMessage, data.aiMessage]
          };
        });
      }`;

const newBlock = `      if (res.ok) {
        const data = await res.json();

        const updatedSession = data.session
          ? {
              ...data.session,
              messages: safeAipbxMessages(data.session.messages)
            }
          : null;

        if (updatedSession) {
          setSessions(prev => {
            const exists = prev.some(s => s.id === updatedSession.id);
            if (!exists) return [...prev, updatedSession];
            return prev.map(s => s.id === updatedSession.id ? updatedSession : s);
          });

          setSelectedSession(updatedSession);
        } else if (data.message) {
          const safeMessage = safeAipbxMessages([data.message])[0];

          if (safeMessage) {
            setSessions(prev => prev.map(s => {
              if (s.id === selectedSession.id) {
                return {
                  ...s,
                  messages: safeAipbxMessages([...(s.messages || []), safeMessage])
                };
              }
              return s;
            }));

            setSelectedSession(prev => {
              if (!prev) return null;
              return {
                ...prev,
                messages: safeAipbxMessages([...(prev.messages || []), safeMessage])
              };
            });
          }
        }
      }`;

if (!s.includes(oldBlock)) {
  console.error('Не найден старый блок обновления сообщений.');
  process.exit(1);
}

s = s.replace(oldBlock, newBlock);

fs.writeFileSync(file, s);

console.log('OK: handleSendMessage теперь обновляет чат из data.session/data.message.');
