import React, { useState } from 'react';
import { Headphones, Loader2 } from 'lucide-react';
import { requestAudioDevices, audioDeviceError } from '../audio/audioDeviceAccess';
import { loadAudioDevicePreferences, saveAudioDevicePreferences } from '../audio/audioDevicePreferences';

type Preview = { ready: boolean; previewId: string | null; extension: string; device: string; changes: string[]; errors: string[] };
export default function HeadsetSetupWizard({ token, onConfigured }: { token: string; onConfigured: () => Promise<void> | void }) {
  const [network, setNetwork] = useState('lan');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioReady, setAudioReady] = useState(false);
  const [preferences, setPreferences] = useState(loadAudioDevicePreferences);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const request = async (action: string, body: object) => {
    const response = await fetch(`/api/softphone/setup/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Настройка не завершена');
    return data;
  };
  const check = async () => {
    setBusy(true); setError(''); setPreview(null); setAudioReady(false);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Error('Откройте PBX Pulse по HTTPS с доверенным сертификатом');
      setStage('Разрешите доступ к микрофону в браузере');
      const list = await requestAudioDevices(navigator.mediaDevices);
      setDevices(list.filter(item => !!item.deviceId)); setAudioReady(true);
      setPreferences(current => ({ ...current,
        microphoneId: list.some(d => d.kind === 'audioinput' && d.deviceId === current.microphoneId) ? current.microphoneId : 'default',
        speakerId: list.some(d => d.kind === 'audiooutput' && d.deviceId === current.speakerId) ? current.speakerId : 'default' }));
      setStage('Проверяем АТС и готовим изменения');
      setPreview(await request('preview', { network }));
      setStage('Проверьте устройства и подтвердите настройку');
    } catch (e: any) { setError(audioDeviceError(e)); setStage(''); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview?.ready || !preview.previewId || !audioReady) return;
    setBusy(true); setError(''); setStage('Настраиваем браузерное устройство и применяем конфигурацию АТС. Это может занять до двух минут.');
    try {
      // Recheck permission/device before any PBX writes; unplugged microphones fail here.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: preferences.microphoneId === 'default' ? true : { deviceId: { exact: preferences.microphoneId } }, video: false });
      stream.getTracks().forEach(track => track.stop());
      saveAudioDevicePreferences(preferences);
      await request('apply', { previewId: preview.previewId, confirm: true });
      setPreview(null); setStage('Устройство настроено. Подключаем гарнитуру; результат регистрации показан ниже.');
      await onConfigured();
    } catch (e: any) { setError(audioDeviceError(e)); setPreview(null); setStage(''); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
    <h5 className="flex items-center gap-2 text-xs font-black text-slate-900"><Headphones className="h-4 w-4" />Мастер подключения гарнитуры</h5>
    <p className="text-xs text-slate-600">Сеть → микрофон → настройка АТС → подключение. Мастер создаёт отдельное браузерное устройство для вашего номера и сохраняет обычный телефон. Первичную настройку выполняет администратор.</p>
    <label className="block text-xs font-semibold">Где вы подключаетесь?
      <select disabled={busy} value={network} onChange={e => { setNetwork(e.target.value); setPreview(null); }} className="ml-2 rounded border p-2">
        <option value="lan">В сети АТС или через VPN</option><option value="internet">Из Интернета без VPN</option>
      </select>
    </label>
    {network === 'internet' && <p className="text-xs text-amber-800">Сначала подключите VPN к сети АТС. Прямой доступ через Интернет требует отдельной настройки NAT и медиатрафика.</p>}
    <button type="button" disabled={busy || network !== 'lan'} onClick={() => void check()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Подготовить подключение</button>
    {audioReady && <div className="grid gap-3 sm:grid-cols-2">
      {([['microphoneId', 'audioinput', 'Микрофон'], ['speakerId', 'audiooutput', 'Звук разговора']] as const).map(([key, kind, label]) => <label key={key} className="text-xs">{label}<select disabled={busy || (kind === 'audiooutput' && !('setSinkId' in HTMLMediaElement.prototype))} value={preferences[key]} onChange={e => setPreferences(current => ({ ...current, [key]: e.target.value }))} className="mt-1 w-full rounded border p-2"><option value="default">Системный по умолчанию</option>{devices.filter(d => d.kind === kind && d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `${label} ${i + 1}`}</option>)}</select></label>)}
    </div>}
    {preview && <div className="space-y-2 rounded-lg bg-white p-3 text-xs">
      <p>Ваш номер: <strong>{preview.extension}</strong>. Браузерное устройство: <strong>{preview.device}</strong>.</p>
      <ul className="list-disc space-y-1 pl-5">{preview.changes.map(change => <li key={change}>{change}</li>)}</ul>
      {preview.errors.map(message => <p key={message} className="text-rose-700">{message}</p>)}
      <button type="button" disabled={busy || !preview.ready} onClick={() => void apply()} className="rounded-lg bg-emerald-600 px-3 py-2 font-bold text-white disabled:opacity-50">Настроить и подключить</button>
    </div>}
    {stage && <p role="status" className="text-xs text-slate-600">{stage}</p>}
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
  </section>;
}
