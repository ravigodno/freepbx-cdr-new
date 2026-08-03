import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle, KeyRound, Play, RefreshCw, Save, ShieldAlert } from 'lucide-react';

type Props = { token: string; canManage: boolean; canViewAnalytics: boolean; canListenRecordings: boolean; mode: 'summary' | 'details' | 'settings'; refreshKey?: number; refreshing?: boolean };
const initialSettings: any = { enabled: false, authMode: 'permanent_token', timeoutMs: 15000, syncIntervalMinutes: 15, initialLoadDays: 30, overlapHours: 24,
  configured: false, apiV1Configured: false, permanentTokenLast4: null, loginLast4: null, apiV1KeyLast4: null, packageSettings: null };
const duration = (value: number | null) => value == null ? '—' : `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
const amount = (value: number | null, currency = 'RUB') => value == null ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 4 })}${currency === 'RUB' ? ' ₽' : ` ${currency}`}`;

export default function NovofonBalancePanel({ token, canManage, canViewAnalytics, canListenRecordings, mode, refreshKey = 0, refreshing = false }: Props) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
  const [settings, setSettings] = useState<any>(initialSettings); const [secrets, setSecrets] = useState<any>({ permanentToken: '', login: '', password: '', apiV1Key: '', apiV1Secret: '' });
  const [summary, setSummary] = useState<any>(null); const [items, setItems] = useState<any[]>([]); const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<any>({ from: '', to: '', direction: '', number: '', employee: '', state: '', charged: '', recording: '' });
  const [busy, setBusy] = useState(''); const [message, setMessage] = useState(''); const [diagnostics, setDiagnostics] = useState<any[]>([]);

  const request = async (url: string, init: RequestInit = {}) => { const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } }); const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.safeMessage || data.safeErrorCode || data.error || 'Novofon API недоступен'); return data; };
  const loadSettings = async () => { if (!canManage) return; const data = await request('/api/balance/providers/novofon/settings'); setSettings(data.settings); };
  const loadSummary = async () => { const data = await request('/api/balance/providers/novofon/summary'); setSummary(data.summary); };
  const loadUsage = async () => { if (!canViewAnalytics) return; const query = new URLSearchParams({ limit: '100', ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value).map(([key, value]) => [key, String(value)])) });
    const data = await request(`/api/balance/providers/novofon/usage?${query}`); setItems(data.items || []); setTotal(data.total || 0); };
  useEffect(() => { if (!token) return; if (mode === 'settings') void loadSettings().catch(error => setMessage(error.message)); else void loadSummary().catch(error => setMessage(error.message)); }, [token, mode, refreshKey]);
  useEffect(() => { if (mode === 'details') void loadUsage().catch(error => setMessage(error.message)); }, [mode, filters]);

  const action = async (name: string, url: string, body?: any) => { setBusy(name); setMessage(''); try { const data = await request(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
    if (name === 'diagnose') setDiagnostics(data.diagnostics || []); await Promise.all([loadSummary().catch(() => undefined), loadUsage().catch(() => undefined)]); setMessage('Операция Novofon выполнена');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(''); } };
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy('save'); try { const data = await request('/api/balance/providers/novofon/settings', { method: 'PUT', body: JSON.stringify({ ...settings, ...secrets }) });
    setSettings(data.settings); setSecrets({ permanentToken: '', login: '', password: '', apiV1Key: '', apiV1Secret: '' }); setMessage('Настройки Novofon сохранены'); } catch (error: any) { setMessage(error.message); } finally { setBusy(''); } };
  const playRecording = async (eventId: number) => { try { const data = await request(`/api/balance/providers/novofon/recordings/${eventId}?json=1`); window.open(data.url, '_blank', 'noopener,noreferrer'); } catch (error: any) { setMessage(error.message); } };

  if (mode === 'settings') return canManage ? <form onSubmit={save} className="space-y-4 rounded-3xl border border-violet-200 bg-violet-50/40 p-5 text-xs dark:border-violet-900 dark:bg-violet-950/10">
    <div className="flex items-center justify-between"><div><h3 className="flex items-center gap-2 text-sm font-black"><KeyRound className="h-4 w-4 text-violet-600" />Novofon</h3><p className="mt-1 text-[11px] text-slate-500">Data API 2.0 и необязательный API v1 · секреты хранятся только на backend</p></div>
      <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Включён</label></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label>Режим Data API<select className="input mt-1 w-full" value={settings.authMode} onChange={e => setSettings({ ...settings, authMode: e.target.value })}><option value="permanent_token">Постоянный ключ</option><option value="login_password">Логин и пароль</option></select></label>
      {settings.authMode === 'permanent_token' ? <label>Постоянный access token<input className="input mt-1 w-full" type="password" autoComplete="new-password" value={secrets.permanentToken} onChange={e => setSecrets({ ...secrets, permanentToken: e.target.value })} placeholder={settings.permanentTokenLast4 ? `Сохранён · …${settings.permanentTokenLast4}` : 'Введите токен'} /></label> : <>
        <label>Логин<input className="input mt-1 w-full" autoComplete="off" value={secrets.login} onChange={e => setSecrets({ ...secrets, login: e.target.value })} placeholder={settings.loginLast4 ? `Сохранён · …${settings.loginLast4}` : 'Логин'} /></label>
        <label>Пароль<input className="input mt-1 w-full" type="password" autoComplete="new-password" value={secrets.password} onChange={e => setSecrets({ ...secrets, password: e.target.value })} placeholder={settings.configured ? 'Сохранён · оставьте пустым без изменения' : 'Пароль'} /></label></>}
      <label>API v1 key (необязательно)<input className="input mt-1 w-full" type="password" value={secrets.apiV1Key} onChange={e => setSecrets({ ...secrets, apiV1Key: e.target.value })} placeholder={settings.apiV1KeyLast4 ? `Сохранён · …${settings.apiV1KeyLast4}` : 'API key'} /></label>
      <label>API v1 secret (необязательно)<input className="input mt-1 w-full" type="password" value={secrets.apiV1Secret} onChange={e => setSecrets({ ...secrets, apiV1Secret: e.target.value })} placeholder={settings.apiV1Configured ? 'Сохранён · оставьте пустым без изменения' : 'API secret'} /></label>
      <label>Автосинхронизация, минут<input className="input mt-1 w-full" type="number" min="5" max="1440" value={settings.syncIntervalMinutes} onChange={e => setSettings({ ...settings, syncIntervalMinutes: Number(e.target.value) })} /></label>
      <label>Первоначальная загрузка, дней<input className="input mt-1 w-full" type="number" min="1" max="730" value={settings.initialLoadDays} onChange={e => setSettings({ ...settings, initialLoadDays: Number(e.target.value) })} /></label>
      <label>Перекрытие, часов<input className="input mt-1 w-full" type="number" min="24" max="168" value={settings.overlapHours} onChange={e => setSettings({ ...settings, overlapHours: Number(e.target.value) })} /></label>
      <label>Таймаут, мс<input className="input mt-1 w-full" type="number" min="1000" max="60000" value={settings.timeoutMs} onChange={e => setSettings({ ...settings, timeoutMs: Number(e.target.value) })} /></label>
    </div>
    <div className="rounded-2xl border border-dashed border-violet-200 p-3"><div className="mb-2 font-black">Ручной пакет минут (необязательно)</div><div className="grid gap-2 md:grid-cols-4">
      <input className="input" placeholder="Название пакета" value={settings.packageSettings?.name || ''} onChange={e => setSettings({ ...settings, packageSettings: { ...(settings.packageSettings || {}), name: e.target.value } })} />
      <input className="input" type="number" min="0" placeholder="Куплено минут" value={settings.packageSettings?.purchasedMinutes || ''} onChange={e => setSettings({ ...settings, packageSettings: { ...(settings.packageSettings || {}), purchasedMinutes: Number(e.target.value) } })} />
      <input className="input" type="date" value={settings.packageSettings?.periodStart || ''} onChange={e => setSettings({ ...settings, packageSettings: { ...(settings.packageSettings || {}), periodStart: e.target.value } })} />
      <input className="input" type="date" value={settings.packageSettings?.periodEnd || ''} onChange={e => setSettings({ ...settings, packageSettings: { ...(settings.packageSettings || {}), periodEnd: e.target.value } })} />
    </div><p className="mt-2 text-[10px] text-slate-500">Расчётный расход PBXPuls · Расчётный остаток PBXPuls · Официальный остаток оператором не предоставлен</p></div>
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn" disabled={!!busy} onClick={() => void action('diagnose', '/api/balance/providers/novofon/diagnose')}><Activity className="h-4 w-4" />Проверить подключение</button>
      <button className="btn bg-violet-600 text-white" disabled={!!busy}><Save className="h-4 w-4" />Сохранить</button></div>
    {diagnostics.length > 0 && <div className="grid gap-2 md:grid-cols-2">{diagnostics.map(item => <div key={item.code} className="flex items-center gap-2 rounded-xl bg-white p-2 dark:bg-slate-900">{item.status === 'success' ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}<span>{item.message}</span></div>)}</div>}{message && <div className="rounded-xl bg-white p-3 dark:bg-slate-900">{message}</div>}
  </form> : null;

  if (mode === 'summary') {
    const status = refreshing ? 'updating' : String(summary?.apiState?.status || 'unknown');
    const statusLabels: Record<string, string> = { success: 'Подключён', connected: 'Подключён', error: 'Ошибка', disabled: 'Отключён', pending: 'Ожидание', updating: 'Обновление', unknown: 'Нет данных' };
    const statusTone = ['success', 'connected'].includes(status) ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
      : status === 'updating' ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300'
        : status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
          : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
    return <div className="grid gap-4 border-t border-slate-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1.4fr)_minmax(170px,1fr)_minmax(180px,0.8fr)_minmax(175px,auto)] lg:items-center dark:border-slate-700">
    <div><div className="text-[10px] uppercase text-slate-400">Оператор</div><div className="mt-1 font-black">Novofon</div><div className={`mt-1 inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold ${statusTone}`}>{statusLabels[status] || 'Ошибка'}</div></div>
    <div><div className="text-[10px] uppercase text-slate-400">Источник данных</div><div className="mt-1 text-xs font-bold">Novofon API v1 · Data API 2.0</div></div>
    <div className="min-w-[180px]"><div className="text-[10px] uppercase text-slate-400">Текущий баланс</div><div className="mt-1 whitespace-nowrap font-mono text-lg font-black">{summary?.balance == null ? summary?.balanceStatus || 'Нет данных' : amount(summary.balance, summary.currency)}</div></div>
    <div className="min-w-[175px] border-slate-200 text-[10px] text-slate-500 sm:text-right lg:border-l lg:pl-4 dark:border-slate-700">Обновлено:<br /><span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">{summary?.lastSyncAt ? new Date(summary.lastSyncAt).toLocaleString('ru-RU') : 'Нет данных'}</span></div>
    {message && <div className="text-[11px] text-slate-500 lg:col-span-4">{message}</div>}
  </div>;
  }

  return canViewAnalytics ? <div className="mb-5 space-y-4 rounded-3xl border border-violet-200 p-4 dark:border-violet-900"><div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Детализация Novofon</h3><p className="text-[10px] text-slate-500">Финансовые плечи: {total}</p></div>{canManage && <button className="btn" onClick={() => void action('usage', '/api/balance/providers/novofon/usage/sync', { from: filters.from || undefined, to: filters.to || undefined })}><RefreshCw className="h-4 w-4" />Синхронизировать</button>}</div>
    <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-8"><input className="input" type="datetime-local" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /><input className="input" type="datetime-local" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
      <select className="input" value={filters.direction} onChange={e => setFilters({ ...filters, direction: e.target.value })}><option value="">Все направления</option><option value="in">Входящие</option><option value="out">Исходящие</option></select><input className="input" placeholder="Номер" value={filters.number} onChange={e => setFilters({ ...filters, number: e.target.value })} />
      <input className="input" placeholder="Сотрудник" value={filters.employee} onChange={e => setFilters({ ...filters, employee: e.target.value })} /><select className="input" value={filters.state} onChange={e => setFilters({ ...filters, state: e.target.value })}><option value="">Все состояния</option><option value="linked_provider_data">Связано</option><option value="orphan_financial_leg">Без CDR-плеча</option></select>
      <select className="input" value={filters.charged} onChange={e => setFilters({ ...filters, charged: e.target.value })}><option value="">Любое списание</option><option value="yes">Есть списание</option><option value="no">Без списания</option></select><select className="input" value={filters.recording} onChange={e => setFilters({ ...filters, recording: e.target.value })}><option value="">Любая запись</option><option value="yes">Есть запись</option><option value="no">Нет записи</option></select></div>
    <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-left text-[11px]"><thead className="sticky top-0 bg-slate-100 dark:bg-slate-800"><tr>{['Дата и время','Направление','Откуда','Куда','Вирт. номер','Сотрудник','Состояние','Факт. длит.','Тариф. длит.','Цена минуты','Списано','Бонусы','call_session_id','leg_id','Запись','Связь'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{new Date(item.occurredAt).toLocaleString('ru-RU')}</td><td>{item.direction || '—'}</td><td className="font-mono">{item.from || '—'}</td><td className="font-mono">{item.to || '—'}</td><td className="font-mono">{item.virtualNumber || '—'}</td><td>{item.employee || '—'}</td><td>{item.state || '—'}</td><td>{duration(item.actualDurationSeconds)}</td><td>{duration(item.chargeableDurationSeconds)}</td><td>{amount(item.costPerMinute, item.currency)}</td><td>{amount(item.chargedAmount, item.currency)}</td><td>{amount(item.bonusAmount, item.currency)}</td><td className="font-mono">{item.callSessionId}</td><td className="font-mono">{item.legId}</td><td>{item.hasRecording && canListenRecordings ? <button className="btn inline-flex" onClick={() => void playRecording(item.id)}><Play className="h-3 w-3" /></button> : item.hasRecording ? 'Доступ ограничен' : '—'}</td><td>{item.linkStatus}</td></tr>)}</tbody></table></div>
  </div> : null;
}
