const number = new URLSearchParams(location.search).get('number') || '';
document.getElementById('number').textContent = number;
chrome.storage.local.get(['extension']).then(data => { document.getElementById('from').textContent = `С внутреннего: ${data.extension || 'не назначен'}`; });
document.getElementById('cancel').onclick = () => window.close();
async function startCall(speakerphone) {
  const buttons = ['call', 'speakerphone', 'cancel'].map(id => document.getElementById(id));
  const status = document.getElementById('status');
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = speakerphone ? 'Включаем громкую связь…' : 'Запуск звонка…';
  const { extension } = await chrome.storage.local.get(['extension']);
  const result = await chrome.runtime.sendMessage({ type: 'api', path: '/api/click-to-call', init: { method: 'POST', body: JSON.stringify({ fromExtension: extension, toPhoneNumber: number, speakerphone }) } });
  if (result?.ok) { status.textContent = 'Звонок запущен'; setTimeout(() => window.close(), 1200); }
  else { status.textContent = result?.error || 'Ошибка'; buttons.forEach(button => { button.disabled = false; }); }
}
document.getElementById('call').onclick = () => startCall(false);
document.getElementById('speakerphone').onclick = () => startCall(true);
