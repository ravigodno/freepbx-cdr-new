const $ = id => document.getElementById(id);
async function load() {
  const data = await chrome.storage.local.get(['baseUrl', 'username', 'extension', 'authExpired', 'lastCallSeenAt', 'lastCallSeenId', 'lastPollAt', 'lastPollActive', 'lastPollError', 'lastPopupOpenedAt', 'lastPopupError', 'offscreenReadyAt', 'offscreenError']);
  $('baseUrl').value = data.baseUrl || 'http://192.168.1.2:3000';
  $('username').value = data.username || '';
  $('status').textContent = data.authExpired ? 'Сессия истекла — подключитесь снова.' : data.extension ? `Подключено · внутренний ${data.extension}` : 'Не подключено';
  const details = [];
  if (data.offscreenReadyAt) details.push(`Фоновый обработчик: запущен ${new Date(data.offscreenReadyAt).toLocaleString()}`);
  if (data.offscreenError) details.push(`Ошибка фонового обработчика: ${data.offscreenError}`);
  if (data.lastPollAt) details.push(`Опрос: ${new Date(data.lastPollAt).toLocaleString()} · active=${data.lastPollActive === true ? 'да' : 'нет'}`);
  if (data.lastCallSeenAt) details.push(`Звонок обнаружен: ${new Date(data.lastCallSeenAt).toLocaleString()} · ${data.lastCallSeenId}`);
  if (data.lastPopupOpenedAt) details.push(`Окно открыто: ${new Date(data.lastPopupOpenedAt).toLocaleString()}`);
  if (data.lastPollError) details.push(`Ошибка опроса: ${data.lastPollError}`);
  if (data.lastPopupError) details.push(`Ошибка окна: ${data.lastPopupError}`);
  $('diagnostics').textContent = details.join('\n') || 'Активные звонки ещё не обнаружены';
}
$('connect').onclick = async () => {
  const baseUrl = $('baseUrl').value.trim().replace(/\/$/, ''), username = $('username').value.trim(), password = $('password').value;
  $('status').textContent = 'Подключение…';
  try {
    const response = await fetch(baseUrl + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, client: 'browser_extension' }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    const extension = String(body.user?.extension || '').trim();
    if (!extension) throw new Error('Пользователю не назначен внутренний номер');
    if (!body.refreshToken) throw new Error('Сервер не выдал долгосрочную сессию расширения');
    await chrome.storage.local.set({ baseUrl, username, token: body.token, refreshToken: body.refreshToken, sessionExpiresAt: body.sessionExpiresAt, extension, authExpired: false, leadCursor: null, lastCallId: null });
    $('password').value = '';
    $('status').textContent = `Подключено · внутренний ${extension}`;
    const background = await chrome.runtime.sendMessage({ type: 'settings-saved' });
    if (!background?.ok) throw new Error(background?.error || 'Не удалось запустить фоновый обработчик звонков');
  } catch (error) { $('status').textContent = error.message; }
};
$('testPopup').onclick = async () => {
  $('status').textContent = 'Открываю тестовое окно…';
  const result = await chrome.runtime.sendMessage({ type: 'test-call-popup' });
  $('status').textContent = result?.ok ? 'Тестовое окно открыто' : result?.error || 'Не удалось открыть окно';
};
void load();
