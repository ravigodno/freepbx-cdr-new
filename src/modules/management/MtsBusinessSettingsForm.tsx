import React, { useEffect, useState } from 'react';
import { CheckCircle, KeyRound, Save } from 'lucide-react';

type Props = { token: string; canManage: boolean; onSaved: () => void };
type Settings = {
  enabled: boolean;
  apiBase: string;
  lookupType: 'msisdn' | 'account';
  msisdn: string;
  accountNo: string;
  timeoutMs: number;
  syncIntervalMinutes: number;
  usageOverlapHours: number;
  consumerKeyConfigured: boolean;
  consumerSecretConfigured: boolean;
  source: 'pbxpuls' | 'environment';
};

const initial: Settings = {
  enabled: false, apiBase: 'https://api.mts.ru', lookupType: 'msisdn', msisdn: '', accountNo: '',
  timeoutMs: 15000, syncIntervalMinutes: 30, usageOverlapHours: 24,
  consumerKeyConfigured: false, consumerSecretConfigured: false, source: 'environment'
};

export default function MtsBusinessSettingsForm({ token, canManage, onSaved }: Props) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = async () => {
    if (!token || !canManage) return;
    setLoading(true);
    try {
      const response = await fetch('/api/balance/sources/mts-business/settings', { headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error('Настройки недоступны');
      setSettings(data.settings);
    } catch (error: any) {
      setMessage(error.message || 'Настройки недоступны');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token, canManage]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/balance/sources/mts-business/settings', {
        method: 'PUT', headers,
        body: JSON.stringify({ ...settings, consumerKey, consumerSecret })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.safeErrorCode || 'Не удалось сохранить настройки');
      setSettings(data.settings);
      setConsumerKey('');
      setConsumerSecret('');
      setMessage('Настройки MTS Business сохранены и применены');
      onSaved();
    } catch (error: any) {
      setMessage(error.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) return null;
  return (
    <form onSubmit={save} className="space-y-4 rounded-3xl border border-blue-200 bg-blue-50/40 p-5 text-xs dark:border-blue-900 dark:bg-blue-950/10">
      <div className="flex items-center justify-between">
        <div><h3 className="flex items-center gap-2 text-sm font-black"><KeyRound className="h-4 w-4 text-blue-600" />MTS Business API</h3>
          <p className="mt-1 text-[11px] text-slate-500">Управляется PBXPuls · секреты сохраняются в зашифрованном виде</p></div>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Включён</label>
      </div>
      {loading ? <div className="text-slate-500">Загрузка…</div> : <>
        <div className="grid gap-3 md:grid-cols-2">
          <label>Consumer Key
            <input className="input mt-1 w-full" type="password" value={consumerKey} onChange={e => setConsumerKey(e.target.value)}
              placeholder={settings.consumerKeyConfigured ? 'Сохранён · оставьте пустым без изменения' : 'Введите Consumer Key'} autoComplete="new-password" />
          </label>
          <label>Consumer Secret
            <input className="input mt-1 w-full" type="password" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)}
              placeholder={settings.consumerSecretConfigured ? 'Сохранён · оставьте пустым без изменения' : 'Введите Consumer Secret'} autoComplete="new-password" />
          </label>
          <label>Режим поиска<select className="input mt-1 w-full" value={settings.lookupType} onChange={e => setSettings({ ...settings, lookupType: e.target.value as any })}>
            <option value="msisdn">По номеру MSISDN</option><option value="account">По лицевому счёту</option>
          </select></label>
          {settings.lookupType === 'msisdn'
            ? <label>MSISDN<input className="input mt-1 w-full" value={settings.msisdn} onChange={e => setSettings({ ...settings, msisdn: e.target.value })} placeholder="7XXXXXXXXXX" /></label>
            : <label>Лицевой счёт<input className="input mt-1 w-full" value={settings.accountNo} onChange={e => setSettings({ ...settings, accountNo: e.target.value })} /></label>}
          <label>Таймаут, мс<input className="input mt-1 w-full" type="number" min="1000" max="60000" value={settings.timeoutMs} onChange={e => setSettings({ ...settings, timeoutMs: Number(e.target.value) })} /></label>
          <label>Интервал баланса, минут<input className="input mt-1 w-full" type="number" min="1" max="1440" value={settings.syncIntervalMinutes} onChange={e => setSettings({ ...settings, syncIntervalMinutes: Number(e.target.value) })} /></label>
          <label>Overlap детализации, часов<input className="input mt-1 w-full" type="number" min="1" max="168" value={settings.usageOverlapHours} onChange={e => setSettings({ ...settings, usageOverlapHours: Number(e.target.value) })} /></label>
          <label>API endpoint<input className="input mt-1 w-full bg-slate-100" value={settings.apiBase} disabled /></label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-500"><CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            Источник: {settings.source === 'pbxpuls' ? 'Настройки PBXPuls' : 'переменные окружения'}</div>
          <button className="btn bg-blue-600 text-white" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Сохранение…' : 'Сохранить MTS API'}</button>
        </div>
      </>}
      {message && <div className="rounded-xl bg-white p-3 text-[11px] dark:bg-slate-900">{message}</div>}
    </form>
  );
}
