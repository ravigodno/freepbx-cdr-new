const params = new URLSearchParams(location.search);
const participant = (nameKey, numberKey, fallback) => [params.get(nameKey), params.get(numberKey)].filter(Boolean).join(' · ') || fallback;
document.getElementById('source').textContent = participant('sourceName', 'sourceNumber', 'Не определён');
document.getElementById('participantLabel').textContent = params.get('participantLabel') || 'Участник звонка';
document.getElementById('participantDetails').textContent = [params.get('participantCompany'), params.get('participantPosition')].filter(Boolean).join(' · ');
const inboundDid = params.get('inboundDid') || '';
document.getElementById('inboundDid').textContent = inboundDid ? `DID: ${inboundDid}` : '';
document.getElementById('extension').textContent = `Внутренний ${params.get('extension') || '—'}`;
const blacklistButton = document.getElementById('blacklist');
const actionStatus = document.getElementById('callActionStatus');
const direction = params.get('direction') || '';
const linkedid = params.get('id') || '';
const operatorExt = params.get('extension') || '';
const callerNumber = String(params.get('sourceNumber') || '').replace(/\D/g, '');
const canBlacklist = direction === 'incoming' && callerNumber.length >= 7 && callerNumber.length <= 20 && Boolean(linkedid);
blacklistButton.disabled = !canBlacklist;
blacklistButton.title = canBlacklist
  ? `Завершить звонок и добавить ${callerNumber} в черный список`
  : 'Доступно только для внешнего входящего звонка';
document.getElementById('open').onclick = async () => {
  const { baseUrl } = await chrome.storage.local.get(['baseUrl']);
  if (!baseUrl) return;
  const query = params.get('sourceName') || params.get('sourceNumber') || '';
  const url = new URL('/', baseUrl);
  if (query.trim()) url.searchParams.set('directorySearch', query.trim());
  await chrome.tabs.create({ url: url.toString() });
};
blacklistButton.onclick = async () => {
  if (!canBlacklist || blacklistButton.disabled) return;
  blacklistButton.disabled = true;
  actionStatus.textContent = 'Проверяем звонок…';
  const path = `/api/live-calls/${encodeURIComponent(linkedid)}/blacklist-hangup`;
  try {
    const previewResult = await chrome.runtime.sendMessage({
      type: 'api', path: `${path}/preview`,
      init: { method: 'POST', body: JSON.stringify({ operatorExt }) }
    });
    if (!previewResult?.ok || !previewResult.data?.success) throw new Error(previewResult?.error || 'Не удалось проверить звонок');
    const preview = previewResult.data;
    if (!window.confirm(preview.message || `Завершить звонок и добавить ${preview.callerNumber} в черный список?`)) {
      actionStatus.textContent = 'Блокировка отменена';
      blacklistButton.disabled = false;
      return;
    }
    actionStatus.textContent = 'Добавляем номер в ЧС…';
    const applyResult = await chrome.runtime.sendMessage({
      type: 'api', path: `${path}/apply`,
      init: { method: 'POST', body: JSON.stringify({ previewId: preview.previewId }) }
    });
    if (!applyResult?.ok || !applyResult.data?.success) throw new Error(applyResult?.error || 'Не удалось заблокировать звонок');
    actionStatus.textContent = `${applyResult.data.callerNumber} добавлен в ЧС`;
  } catch (error) {
    actionStatus.textContent = error?.message || 'Не удалось заблокировать звонок';
    blacklistButton.disabled = false;
  }
};
