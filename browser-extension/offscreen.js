let busy = false;
void chrome.storage.local.set({ offscreenReadyAt: new Date().toISOString(), offscreenError: '' });
async function pollCall() {
  if (busy) return;
  busy = true;
  try {
    const { token, baseUrl, extension } = await chrome.storage.local.get(['token', 'baseUrl', 'extension']);
    if (!token || !baseUrl || !extension) return;
    const query = new URLSearchParams({ operatorExt: extension });
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/live/call-banner?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (response.status === 401) { const refreshed=await chrome.runtime.sendMessage({type:'api',path:`/api/live/call-banner?${query}`});if(refreshed?.ok)return;await chrome.storage.local.set({ authExpired: true, lastPollError: 'HTTP 401', lastPollAt: new Date().toISOString() }); return; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const call = await response.json();
    await chrome.storage.local.set({
      lastPollAt: new Date().toISOString(),
      lastPollActive: call?.active === true,
      lastPollCallId: String(call?.linkedid || call?.uniqueid || ''),
      lastPollError: ''
    });
    const result = await chrome.runtime.sendMessage({ type: 'live-call', call });
    if (!result?.ok) throw new Error(result?.error || 'Фоновый обработчик не подтвердил событие звонка');
  } catch (error) {
    await chrome.storage.local.set({ lastPollError: String(error?.message || error), lastPollErrorAt: new Date().toISOString() });
  }
  finally { busy = false; }
}
setInterval(pollCall, 3000);
void pollCall();
