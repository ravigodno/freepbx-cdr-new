import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCircle, ExternalLink, Loader2, Phone, X } from 'lucide-react';

type LeadNotice = {
  id: number;
  created_at?: string;
  customer_name?: string;
  phone_raw?: string;
  phone_normalized?: string;
  form_name?: string;
  integration_name?: string;
  form_message?: string;
};

type Props = {
  token: string;
  username: string;
  canManage: boolean;
  canCall: boolean;
};

const POLL_MS = 5000;

export default function SiteFormLeadNotifier({ token, username, canManage, canCall }: Props) {
  const [queue, setQueue] = useState<LeadNotice[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const polling = useRef(false);
  const originalTitle = useRef(typeof document !== 'undefined' ? document.title : 'PBXPuls');
  const cursorKey = useMemo(() => `pbxpuls:site-leads:cursor:${location.origin}:${username}`, [username]);

  const leadUrl = (id: number) => `/?tab=marketing&marketingTab=site-forms&leadId=${id}`;
  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      cache: 'no-store'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Не удалось выполнить действие');
    return body;
  }, [token]);

  const showSystemNotification = useCallback((lead: LeadNotice) => {
    if (!window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') return;
    const claimKey = `pbxpuls:site-lead:notified:${lead.id}`;
    if (localStorage.getItem(claimKey)) return;
    localStorage.setItem(claimKey, String(Date.now()));
    const notice = new Notification(lead.form_name?.startsWith('AI-сотрудник · ') ? 'Новая заявка от AI-сотрудника' : 'Новая заявка с сайта', {
      body: [lead.customer_name || 'Без имени', lead.phone_raw || lead.phone_normalized, lead.form_name || lead.integration_name].filter(Boolean).join(' · '),
      tag: `pbxpuls-site-lead-${lead.id}`,
      requireInteraction: true
    });
    notice.onclick = () => { window.focus(); window.location.href = leadUrl(lead.id); notice.close(); };
  }, []);

  const poll = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const savedCursor = localStorage.getItem(cursorKey);
      const query = savedCursor ? `?afterId=${encodeURIComponent(savedCursor)}` : '';
      const data = await request(`/api/site-forms/leads-notifications${query}`);
      const items = Array.isArray(data.items) ? data.items as LeadNotice[] : [];
      if (savedCursor && items.length) {
        setQueue(previous => {
          const known = new Set(previous.map(item => item.id));
          return [...previous, ...items.filter(item => !known.has(item.id))].slice(-100);
        });
        items.forEach(showSystemNotification);
      }
      localStorage.setItem(cursorKey, String(Number(data.nextAfterId ?? data.latestId ?? savedCursor ?? 0)));
    } catch {
      // Фоновый опрос не должен мешать работе приложения.
    } finally {
      polling.current = false;
    }
  }, [cursorKey, request, showSystemNotification]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [poll]);

  useEffect(() => {
    document.title = queue.length ? `(${queue.length}) Новые заявки · ${originalTitle.current}` : originalTitle.current;
    return () => { document.title = originalTitle.current; };
  }, [queue.length]);

  const current = queue[0];
  if (!current) return null;
  const removeCurrent = () => setQueue(items => items.filter(item => item.id !== current.id));
  const action = async (kind: 'process' | 'call') => {
    setBusy(kind); setError('');
    try {
      if (kind === 'process') await request(`/api/site-forms/leads/${current.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) });
      else await request(`/api/site-forms/leads/${current.id}/call`, { method: 'POST', body: '{}' });
      removeCurrent();
    } catch (cause: any) { setError(cause.message); }
    finally { setBusy(''); }
  };
  const enableNotifications = async () => {
    if (!window.isSecureContext || !('Notification' in window)) { setPermission('unsupported'); return; }
    setPermission(await Notification.requestPermission());
  };

  return <div className="fixed bottom-5 right-5 z-[180] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl dark:border-blue-800 dark:bg-slate-900">
    <div className="flex items-start justify-between bg-blue-600 px-4 py-3 text-white">
      <div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5"/><div><div className="text-sm font-black">{current.form_name?.startsWith('AI-сотрудник · ') ? 'Новая заявка от AI-сотрудника' : 'Новая заявка с сайта'}</div><div className="text-[11px] text-blue-100">#{current.id} · {current.integration_name || current.form_name || 'Форма сайта'}</div></div></div>
      <button onClick={removeCurrent} className="rounded-lg p-1 hover:bg-white/15" aria-label="Закрыть"><X className="h-4 w-4"/></button>
    </div>
    <div className="space-y-3 p-4">
      <div><div className="font-bold text-slate-900 dark:text-white">{current.customer_name || 'Имя не указано'}</div><div className="font-mono text-sm text-blue-700 dark:text-blue-300">{current.phone_raw || current.phone_normalized || 'Телефон не указан'}</div>{current.form_message && <div className="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-300">{current.form_message}</div>}</div>
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      {permission === 'default' && <button onClick={enableNotifications} className="w-full rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Включить системные уведомления</button>}
      {permission === 'unsupported' && <div className="text-[11px] text-amber-700">Системные уведомления требуют HTTPS. Внутренний попап продолжит работать.</div>}
      <div className="grid grid-cols-2 gap-2">
        {canManage && <button disabled={Boolean(busy)} onClick={() => void action('process')} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'process' ? <Loader2 className="h-4 w-4 animate-spin"/> : <CheckCircle className="h-4 w-4"/>}Обработать</button>}
        {canCall && <button disabled={Boolean(busy)} onClick={() => void action('call')} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy === 'call' ? <Loader2 className="h-4 w-4 animate-spin"/> : <Phone className="h-4 w-4"/>}Позвонить</button>}
        <button onClick={() => { window.location.href = leadUrl(current.id); }} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200"><ExternalLink className="h-4 w-4"/>Открыть заявку</button>
      </div>
      {queue.length > 1 && <div className="text-center text-[10px] font-semibold text-slate-400">Ещё новых заявок: {queue.length - 1}</div>}
    </div>
  </div>;
}
