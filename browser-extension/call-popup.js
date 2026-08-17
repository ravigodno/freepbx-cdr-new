const params = new URLSearchParams(location.search);
const participant = (nameKey, numberKey, fallback) => [params.get(nameKey), params.get(numberKey)].filter(Boolean).join(' · ') || fallback;
document.getElementById('source').textContent = participant('sourceName', 'sourceNumber', 'Не определён');
document.getElementById('participantLabel').textContent = params.get('participantLabel') || 'Участник звонка';
document.getElementById('participantDetails').textContent = [params.get('participantCompany'), params.get('participantPosition')].filter(Boolean).join(' · ');
const inboundDid = params.get('inboundDid') || '';
document.getElementById('inboundDid').textContent = inboundDid ? `DID: ${inboundDid}` : '';
document.getElementById('extension').textContent = `Внутренний ${params.get('extension') || '—'}`;
document.getElementById('open').onclick = async () => {
  const { baseUrl } = await chrome.storage.local.get(['baseUrl']);
  if (!baseUrl) return;
  const query = params.get('sourceName') || params.get('sourceNumber') || '';
  const url = new URL('/', baseUrl);
  if (query.trim()) url.searchParams.set('directorySearch', query.trim());
  await chrome.tabs.create({ url: url.toString() });
};
