const number = new URLSearchParams(location.search).get('number') || '';
document.getElementById('number').textContent = number;
chrome.storage.local.get(['extension']).then(data => { document.getElementById('from').textContent = `С внутреннего: ${data.extension || 'не назначен'}`; });
document.getElementById('cancel').onclick = () => window.close();
document.getElementById('call').onclick = async () => {
  const button = document.getElementById('call'), status = document.getElementById('status');
  button.disabled = true; status.textContent = 'Запуск звонка…';
  const { extension } = await chrome.storage.local.get(['extension']);
  const result = await chrome.runtime.sendMessage({ type: 'api', path: '/api/click-to-call', init: { method: 'POST', body: JSON.stringify({ fromExtension: extension, toPhoneNumber: number }) } });
  if (result?.ok) { status.textContent = 'Звонок запущен'; setTimeout(() => window.close(), 1200); }
  else { status.textContent = result?.error || 'Ошибка'; button.disabled = false; }
};
