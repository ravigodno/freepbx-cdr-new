importScripts('call-lifecycle.js', 'phone-number.js');

const LEAD_ALARM = 'pbxpuls-leads';
const SELECTION_CALL_MENU = 'pbxpuls-call-selection';
const programmaticPopupClosures = new Set();
const { resolveCallEndPolicy } = PBXPulsCallLifecycle;
const { normalizePhoneNumber } = PBXPulsPhoneNumber;

async function ensureSelectionCallMenu() {
  await chrome.contextMenus.remove(SELECTION_CALL_MENU).catch(() => undefined);
  chrome.contextMenus.create({
    id: SELECTION_CALL_MENU,
    title: 'Позвонить через PBXPuls: %s',
    contexts: ['selection']
  });
}

async function openCallConfirmation(value) {
  const number = normalizePhoneNumber(value);
  if (!number) throw new Error('Выделенный текст не похож на номер телефона');
  const target = chrome.runtime.getURL(`confirm-call.html?number=${encodeURIComponent(number)}`);
  const popup = await chrome.windows.create({ url: target, type: 'popup', width: 390, height: 320, focused: true });
  await chrome.storage.local.set({ lastTelLinkAt: new Date().toISOString(), lastTelLinkError: '' });
  return popup;
}

async function ensureAlarm() {
  if (!await chrome.alarms.get(LEAD_ALARM)) {
    await chrome.alarms.create(LEAD_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  }
}

async function injectTelInterceptors() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs
    .filter(tab => tab.id && /^https?:/i.test(String(tab.url || '')))
    .map(tab => chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['phone-number.js', 'tel-links.js'] }).catch(() => undefined)));
}

let livePollBusy = false;
let livePollTimer = null;
async function pollActiveCall() {
  if (livePollBusy) return;
  livePollBusy = true;
  try {
    const config = await settings();
    if (!config.token || !config.baseUrl || !config.extension) return;
    const query = new URLSearchParams({ operatorExt: config.extension });
    const call = await api(`/api/live/call-banner?${query}`);
    await chrome.storage.local.set({
      lastPollAt: new Date().toISOString(),
      lastPollActive: call?.active === true,
      lastPollCallId: String(call?.linkedid || call?.uniqueid || ''),
      lastPollError: ''
    });
    await showCallPopup(call, config);
  } catch (error) {
    await chrome.storage.local.set({ lastPollError: String(error?.message || error), lastPollErrorAt: new Date().toISOString() });
  } finally {
    livePollBusy = false;
  }
}

async function startBackgroundPolling() {
  if (!livePollTimer) livePollTimer = setInterval(() => { void pollActiveCall(); }, 3000);
  await chrome.storage.local.set({ offscreenReadyAt: new Date().toISOString(), offscreenError: '' });
  await pollActiveCall();
  return true;
}

async function settings() {
  return chrome.storage.local.get(['baseUrl', 'token', 'refreshToken', 'extension', 'leadCursor', 'lastCallId', 'lastCallDirection', 'lastCallConnected', 'lastCallIsOutgoingForOperator', 'lastCallEndDeadline', 'callPopupWindowId', 'dismissedCallPopupId', 'testPopupUntil']);
}

function buildDirectorySearchUrl(baseUrl, query) {
  const url = new URL('/', baseUrl);
  const value = String(query || '').trim();
  if (value) url.searchParams.set('directorySearch', value);
  return url.toString();
}

async function rememberCallNotificationTarget(notificationId, query, action = null) {
  const stored = await chrome.storage.local.get('callNotificationTargets');
  const targets = stored.callNotificationTargets && typeof stored.callNotificationTargets === 'object'
    ? stored.callNotificationTargets
    : {};
  targets[notificationId] = { query: String(query || '').trim(), action, createdAt: Date.now() };
  const recent = Object.fromEntries(Object.entries(targets)
    .sort((left, right) => Number(right[1]?.createdAt || 0) - Number(left[1]?.createdAt || 0))
    .slice(0, 50));
  await chrome.storage.local.set({ callNotificationTargets: recent });
}

async function closeCallPopupWindow(config) {
  if (Number(config.testPopupUntil || 0) > Date.now()) return;
  if (config.callPopupWindowId) {
    programmaticPopupClosures.add(config.callPopupWindowId);
    await chrome.windows.remove(config.callPopupWindowId).catch(() => programmaticPopupClosures.delete(config.callPopupWindowId));
  }
  await chrome.storage.local.remove(['callPopupWindowId', 'testPopupUntil']);
}

async function clearCallNotification(config) {
  const callId = String(config.lastCallId || '');
  if (callId) await chrome.notifications.clear(`call:${callId}`).catch(() => undefined);
  await chrome.storage.local.remove(['lastCallId', 'lastCallDirection', 'lastCallConnected', 'lastCallIsOutgoingForOperator', 'lastCallEndDeadline']);
}

async function handleEndedCall(config) {
  await closeCallPopupWindow(config);
  if (config.dismissedCallPopupId) await chrome.storage.local.remove('dismissedCallPopupId');
  if (!config.lastCallId || Number(config.testPopupUntil || 0) > Date.now()) {
    return;
  }
  await chrome.notifications.update(`call:${config.lastCallId}`, { buttons: [] }).catch(() => undefined);
  const policy = resolveCallEndPolicy(
    config.lastCallDirection,
    config.lastCallConnected === true,
    config.lastCallIsOutgoingForOperator === true
  );
  if (policy.action === 'keep') {
    if (config.lastCallEndDeadline) await chrome.storage.local.remove('lastCallEndDeadline');
    return;
  }
  if (policy.delayMs === 0) {
    await clearCallNotification(config);
    return;
  }
  const deadline = Number(config.lastCallEndDeadline || 0) || Date.now() + policy.delayMs;
  if (!config.lastCallEndDeadline) await chrome.storage.local.set({ lastCallEndDeadline: deadline });
  if (Date.now() >= deadline) await clearCallNotification({ ...config, lastCallEndDeadline: deadline });
}

async function showCallPopup(call, config) {
  const id = String(call.linkedid || call.uniqueid || '');
  if (!call.active || !id) { await handleEndedCall(config); return; }
  const sameCall = config.lastCallId === id;
  const wasConnected = call.connected === true || (sameCall && config.lastCallConnected === true);
  const digits = value => String(value || '').replace(/\D/g, '');
  const operatorExtension = digits(call.operatorExt || config.extension);
  const incoming = call.direction === 'incoming';
  const callerNumber = String(incoming
    ? (call.externalCallerNumber || call.callerNumber || call.sourceNumber || call.number || '')
    : (call.internalCaller || call.sourceNumber || call.callerNumber || ''));
  const operatorIsCaller = Boolean(operatorExtension) && digits(callerNumber) === operatorExtension;
  const isOutgoingForOperator = call.direction === 'outgoing' || (call.direction === 'internal' && operatorIsCaller);
  await chrome.storage.local.set({
    lastCallId: id,
    lastCallDirection: String(call.direction || config.lastCallDirection || ''),
    lastCallConnected: wasConnected,
    lastCallIsOutgoingForOperator: isOutgoingForOperator,
    lastCallEndDeadline: null
  });
  await chrome.storage.local.set({ lastCallSeenAt: new Date().toISOString(), lastCallSeenId: id });
  if (config.dismissedCallPopupId && config.dismissedCallPopupId !== id) {
    await chrome.storage.local.remove('dismissedCallPopupId');
    config.dismissedCallPopupId = null;
  }
  if (config.dismissedCallPopupId === id) return;
  if (config.lastCallId === id && config.callPopupWindowId) {
    const existing = await chrome.windows.get(config.callPopupWindowId).catch(() => null);
    if (existing) return;
    await chrome.storage.local.remove('callPopupWindowId');
    config.callPopupWindowId = null;
  }
  if (config.callPopupWindowId) {
    programmaticPopupClosures.add(config.callPopupWindowId);
    await chrome.windows.remove(config.callPopupWindowId).catch(() => programmaticPopupClosures.delete(config.callPopupWindowId));
  }
  const destinationNumber = String(call.destinationNumber || call.targetNumber || call.number || '');
  const caller = {
    name: String(incoming ? (call.displayName || call.callerDisplayName || '') : (call.callerDisplayName || '')),
    number: callerNumber,
    company: String(call.callerCompany || (incoming ? call.company : '') || ''),
    position: String(call.callerPosition || (incoming ? call.position : '') || '')
  };
  const destination = {
    name: String(call.destinationDisplayName || call.displayName || ''),
    number: destinationNumber,
    company: String(call.destinationCompany || (!incoming ? call.company : '') || ''),
    position: String(call.destinationPosition || (!incoming ? call.position : '') || '')
  };
  const counterparty = incoming ? caller : (operatorIsCaller ? destination : caller);
  const params = new URLSearchParams({
    id,
    direction: String(call.direction || ''),
    name: String(call.displayName || call.callerDisplayName || ''),
    number: String(call.externalCallerNumber || call.callerNumber || call.number || ''),
    company: String(call.company || ''),
    extension: String(call.operatorExt || config.extension || ''),
    sourceName: counterparty.name,
    sourceNumber: counterparty.number,
    participantCompany: counterparty.company,
    participantPosition: counterparty.position,
    inboundDid: incoming ? String(call.did || call.trunkNumber || '') : '',
    participantLabel: isOutgoingForOperator ? 'Куда звоним' : 'Кто звонит',
    connected: call.connected === true ? 'true' : 'false',
    ringing: call.ringing === true ? 'true' : 'false',
    startedAt: String(call.startedAt || ''),
    duration: String(call.durationText || '')
  });
  const popupOptions = { url: chrome.runtime.getURL(`call-popup.html?${params}`), type: 'popup', width: 440, height: 265, focused: true };
  let popup;
  try {
    popup = await chrome.windows.create(popupOptions);
  } catch (error) {
    await chrome.storage.local.remove(['lastCallId', 'callPopupWindowId']);
    popup = await chrome.windows.create(popupOptions);
  }
  if (!popup?.id) throw new Error('Chrome не вернул идентификатор окна звонка');
  await chrome.storage.local.set({
    lastCallId: id,
    lastCallDirection: String(call.direction || ''),
    lastCallConnected: wasConnected,
    lastCallIsOutgoingForOperator: isOutgoingForOperator,
    callPopupWindowId: popup.id,
    lastPopupOpenedAt: new Date().toISOString(),
    lastPopupError: ''
  });
  const notificationId = `call:${id}`;
  const externalIncomingNumber = incoming ? digits(counterparty.number) : '';
  const blacklistAction = externalIncomingNumber.length >= 7 && externalIncomingNumber.length <= 20
    ? { type: 'blacklist-hangup', linkedid: id, operatorExt: String(call.operatorExt || config.extension || ''), callerNumber: externalIncomingNumber }
    : null;
  await rememberCallNotificationTarget(notificationId, counterparty.name || counterparty.number, blacklistAction);
  await chrome.notifications.create(notificationId, {
    type: 'basic', iconUrl: 'icon128.png', title: isOutgoingForOperator ? 'Куда звоним' : 'Кто звонит',
    message: [counterparty.name, counterparty.number, counterparty.company, counterparty.position].filter(Boolean).join(' · '),
    priority: 2, requireInteraction: true,
    ...(blacklistAction ? { buttons: [{ title: 'В ЧС и завершить' }] } : {})
  });
}

let refreshPromise=null;
async function refreshAccessToken(config){if(!config.refreshToken)return null;if(!refreshPromise)refreshPromise=fetch(config.baseUrl.replace(/\/$/,'')+'/api/auth/browser-extension/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:config.refreshToken})}).then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);await chrome.storage.local.set({token:body.token,refreshToken:body.refreshToken,sessionExpiresAt:body.sessionExpiresAt,authExpired:false});return body.token;}).finally(()=>{refreshPromise=null});return refreshPromise;}
async function api(path, init = {}, retried = false) {
  const config = await settings();
  if (!config.baseUrl || !config.token) throw new Error('Расширение не подключено');
  const response = await fetch(config.baseUrl.replace(/\/$/, '') + path, {
    ...init,
    cache: 'no-store',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if(response.status===401&&!retried){try{if(await refreshAccessToken(config))return api(path,init,true);}catch{}await chrome.storage.local.set({authExpired:true});}
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function pollLeads() {
  const config = await settings();
  if (!config.token) return;
  const suffix = config.leadCursor ? `?afterId=${encodeURIComponent(config.leadCursor)}` : '';
  const data = await api('/api/site-forms/leads-notifications' + suffix);
  const items = Array.isArray(data.items) ? data.items : [];
  if (config.leadCursor) for (const lead of items) {
    await chrome.notifications.create(`lead:${lead.id}`, {
      type: 'basic', iconUrl: 'icon128.png', title: 'Новая заявка с сайта',
      message: [lead.customer_name || 'Без имени', lead.phone_raw || lead.phone_normalized || '', lead.form_name || lead.integration_name || ''].filter(Boolean).join(' · '),
      priority: 2, requireInteraction: true
    });
  }
  await chrome.storage.local.set({ leadCursor: Number(data.nextAfterId ?? data.latestId ?? config.leadCursor ?? 0) });
}

chrome.runtime.onInstalled.addListener(() => { void ensureAlarm(); void ensureSelectionCallMenu(); void injectTelInterceptors(); void startBackgroundPolling().catch(() => undefined); });
chrome.runtime.onStartup.addListener(() => { void ensureAlarm(); void ensureSelectionCallMenu(); void injectTelInterceptors(); void startBackgroundPolling().catch(() => undefined); });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === LEAD_ALARM) {
    void pollLeads().catch(() => undefined);
    void startBackgroundPolling().catch(() => undefined);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'settings-saved') {
    void ensureAlarm()
      .then(() => injectTelInterceptors())
      .then(() => startBackgroundPolling())
      .then(() => sendResponse({ ok: true }))
      .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  }
  if (message?.type === 'test-call-popup') {
    void settings().then(async config => { config.testPopupUntil = Date.now() + 15000; await chrome.storage.local.set({ testPopupUntil: config.testPopupUntil }); return showCallPopup({ active: true, linkedid: `test-${Date.now()}`, direction: 'incoming', displayName: 'Тестовое окно PBXPuls', callerNumber: '+7 000 000-00-00', company: 'Проверка расширения', operatorExt: config.extension }, config); }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'tel-link') {
    void openCallConfirmation(message.number)
      .then(async popup => {
        sendResponse({ ok: true, windowId: popup.id });
      })
      .catch(async error => {
        await chrome.storage.local.set({ lastTelLinkError: String(error?.message || error), lastTelLinkErrorAt: new Date().toISOString() });
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === 'live-call') {
    const call = message.call || {};
    void settings()
      .then(config => showCallPopup(call, config))
      .then(() => sendResponse({ ok: true }))
      .catch(async error => {
        await chrome.storage.local.set({ lastPopupError: String(error?.message || error), lastPopupErrorAt: new Date().toISOString() });
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  }
  if (message?.type === 'api') {
    void api(message.path, message.init).then(data => sendResponse({ ok: true, data })).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== SELECTION_CALL_MENU) return;
  void openCallConfirmation(info.selectionText).catch(async error => {
    await chrome.storage.local.set({ lastTelLinkError: String(error?.message || error), lastTelLinkErrorAt: new Date().toISOString() });
  });
});

chrome.windows.onRemoved.addListener(async windowId => {
  const config = await settings();
  if (config.callPopupWindowId !== windowId) return;
  if (programmaticPopupClosures.delete(windowId)) {
    await chrome.storage.local.remove('callPopupWindowId');
    return;
  }
  await chrome.storage.local.set({ dismissedCallPopupId: String(config.lastCallId || '') });
  await chrome.storage.local.remove('callPopupWindowId');
});

chrome.notifications.onClicked.addListener(id => {
  void Promise.all([settings(), chrome.storage.local.get('callNotificationTargets')]).then(([config, stored]) => {
    if (!config.baseUrl) return;
    const match = /^lead:(\d+)$/.exec(id);
    const callTarget = stored.callNotificationTargets?.[id]?.query || '';
    const url = match
      ? `${config.baseUrl}/?tab=marketing&marketingTab=site-forms&leadId=${match[1]}`
      : (/^call:/.test(id) ? buildDirectorySearchUrl(config.baseUrl, callTarget) : config.baseUrl);
    void chrome.tabs.create({ url });
  });
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex !== 0 || !/^call:/.test(notificationId)) return;
  void chrome.storage.local.get('callNotificationTargets').then(async stored => {
    const action = stored.callNotificationTargets?.[notificationId]?.action;
    if (action?.type !== 'blacklist-hangup' || !action.linkedid || !action.operatorExt) return;
    const path = `/api/live-calls/${encodeURIComponent(action.linkedid)}/blacklist-hangup`;
    try {
      await chrome.notifications.update(notificationId, { buttons: [] });
      const preview = await api(`${path}/preview`, {
        method: 'POST', body: JSON.stringify({ operatorExt: action.operatorExt })
      });
      if (!preview?.success || !preview.previewId) throw new Error(preview?.error || 'Не удалось проверить звонок');
      const result = await api(`${path}/apply`, {
        method: 'POST', body: JSON.stringify({ previewId: preview.previewId })
      });
      if (!result?.success) throw new Error(result?.error || 'Не удалось заблокировать звонок');
      await chrome.notifications.clear(notificationId).catch(() => undefined);
      await chrome.notifications.create(`blacklist:${Date.now()}`, {
        type: 'basic', iconUrl: 'icon128.png', title: 'Номер добавлен в ЧС',
        message: `${result.callerNumber || action.callerNumber} · звонок завершён`, priority: 1
      });
    } catch (error) {
      await chrome.notifications.create(`blacklist-error:${Date.now()}`, {
        type: 'basic', iconUrl: 'icon128.png', title: 'Не удалось добавить в ЧС',
        message: String(error?.message || error || 'Неизвестная ошибка'), priority: 1
      });
    }
  });
});

void ensureAlarm();
void startBackgroundPolling().catch(() => undefined);
