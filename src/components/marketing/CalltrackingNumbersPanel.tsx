import { useEffect, useMemo, useState } from 'react';
import { Loader2, Phone, Plus, Power, Route } from 'lucide-react';
import { CalltrackingPhoneNumber, CalltrackingReplacementMatchType, CalltrackingReplacementRule, CalltrackingSite } from './types';

interface Props {
  sites?: CalltrackingSite[];
  numbers?: CalltrackingPhoneNumber[];
  rules?: CalltrackingReplacementRule[];
  loading?: boolean;
  error?: string;
  onChanged?: () => void;
}

const matchTypes: Array<{ value: CalltrackingReplacementMatchType; label: string }> = [
  { value: 'utm_source', label: 'utm_source' },
  { value: 'utm_medium', label: 'utm_medium' },
  { value: 'utm_campaign', label: 'utm_campaign' },
  { value: 'referrer', label: 'Referrer' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'default', label: 'По умолчанию' }
];

function getAuthToken(): string {
  const sessionSaved = localStorage.getItem('asterisk_cdr_session');
  if (!sessionSaved) return '';
  try { return JSON.parse(sessionSaved)?.token || ''; } catch { return ''; }
}

function safeText(value: unknown): string {
  const text = String(value || '').trim();
  return text || '—';
}

function statusClass(active: boolean): string {
  return active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
}

function matchTypeLabel(value: unknown): string {
  return matchTypes.find(item => item.value === value)?.label || safeText(value);
}

export function CalltrackingNumbersPanel({ sites = [], numbers = [], rules = [], loading = false, error = '', onChanged }: Props) {
  const primarySite = sites[0];
  const [siteId, setSiteId] = useState(primarySite?.id || '');
  const [phoneLabel, setPhoneLabel] = useState('Основной номер');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [phoneHref, setPhoneHref] = useState('');
  const [did, setDid] = useState('');
  const [ruleName, setRuleName] = useState('Правило подмены');
  const [priority, setPriority] = useState(100);
  const [matchType, setMatchType] = useState<CalltrackingReplacementMatchType>('utm_source');
  const [matchValue, setMatchValue] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!siteId && primarySite?.id) setSiteId(primarySite.id);
  }, [primarySite?.id, siteId]);

  const siteNumbers = useMemo(() => numbers.filter(item => item.siteId === siteId), [numbers, siteId]);
  const siteRules = useMemo(() => rules.filter(item => item.siteId === siteId).sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0)), [rules, siteId]);

  useEffect(() => {
    if (!phoneNumberId && siteNumbers.length) setPhoneNumberId(siteNumbers[0].id);
    if (phoneNumberId && !siteNumbers.some(item => item.id === phoneNumberId)) setPhoneNumberId(siteNumbers[0]?.id || '');
  }, [phoneNumberId, siteNumbers]);

  const requestJson = async (url: string, method: string, body?: unknown) => {
    const token = getAuthToken();
    const response = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.ok === false) throw new Error(json.error || 'Не удалось сохранить изменения.');
    return json;
  };

  const savePhone = async () => {
    if (!siteId || !phoneDisplay.trim()) {
      setMessage('Укажите сайт и номер для показа.');
      return;
    }
    setSavingPhone(true);
    setMessage('');
    try {
      await requestJson('/api/calltracking/phone-numbers', 'POST', { siteId, phoneLabel, phoneDisplay, phoneHref, did, isActive: true });
      setPhoneLabel('Основной номер');
      setPhoneDisplay('');
      setPhoneHref('');
      setDid('');
      setMessage('Номер добавлен.');
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось добавить номер.');
    } finally {
      setSavingPhone(false);
    }
  };

  const togglePhone = async (phone: CalltrackingPhoneNumber) => {
    setUpdatingId(phone.id);
    setMessage('');
    try {
      await requestJson('/api/calltracking/phone-numbers/' + phone.id, 'PATCH', { isActive: !phone.isActive });
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось изменить номер.');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveRule = async () => {
    if (!siteId || !phoneNumberId) {
      setMessage('Выберите сайт и номер для правила.');
      return;
    }
    if (matchType !== 'default' && !matchValue.trim()) {
      setMessage('Укажите значение условия или выберите правило по умолчанию.');
      return;
    }
    setSavingRule(true);
    setMessage('');
    try {
      await requestJson('/api/calltracking/replacement-rules', 'POST', { siteId, ruleName, priority, matchType, matchValue, phoneNumberId, isActive: true });
      setRuleName('Правило подмены');
      setPriority(priority + 10);
      setMatchValue('');
      setMessage('Правило добавлено.');
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось добавить правило.');
    } finally {
      setSavingRule(false);
    }
  };

  const toggleRule = async (rule: CalltrackingReplacementRule) => {
    setUpdatingId(rule.id);
    setMessage('');
    try {
      await requestJson('/api/calltracking/replacement-rules/' + rule.id, 'PATCH', { isActive: !rule.isActive });
      onChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось изменить правило.');
    } finally {
      setUpdatingId(null);
    }
  };

  const phoneName = (id: string) => siteNumbers.find(item => item.id === id)?.phoneDisplay || id;
  const dataAttributeExample = '<span data-pbxpuls-phone>+7 978 000-00-00</span>\n<a data-pbxpuls-phone-link href="tel:+79780000000">+7 978 000-00-00</a>';

  return (
    <div className="max-w-full space-y-4 overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-950 dark:text-white">Номера и подмена</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Первая версия полудинамического коллтрекинга: один номер на источник, кампанию, referrer, landing page или правило по умолчанию.</p>
        </div>
        <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Fail-open: при ошибке остается исходный номер</span>
      </div>

      {error && <div className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{error}</div>}
      {message && <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-300">{message}</div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Phone className="h-4 w-4 text-blue-600" />Номера</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Сайт
              <select value={siteId} onChange={event => setSiteId(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <option value="">Выберите сайт</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name || site.domain || site.id}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Метка
              <input value={phoneLabel} onChange={event => setPhoneLabel(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Номер на сайте
              <input value={phoneDisplay} onChange={event => setPhoneDisplay(event.target.value)} placeholder="+7 978 000-00-00" className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Href tel:
              <input value={phoneHref} onChange={event => setPhoneHref(event.target.value)} placeholder="tel:+79780000000" className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 md:col-span-2">DID / номер компании в АТС
              <input value={did} onChange={event => setDid(event.target.value)} placeholder="79780000000" className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
          </div>
          <button onClick={savePhone} disabled={savingPhone || !siteId || !phoneDisplay.trim()} className="mt-3 inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{savingPhone ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}Добавить номер</button>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white"><Route className="h-4 w-4 text-purple-600" />Правила подмены</div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Название
              <input value={ruleName} onChange={event => setRuleName(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Приоритет
              <input type="number" min={0} max={9999} value={priority} onChange={event => setPriority(Math.max(0, Math.min(9999, Number(event.target.value) || 0)))} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Тип условия
              <select value={matchType} onChange={event => setMatchType(event.target.value as CalltrackingReplacementMatchType)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {matchTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Значение
              <input value={matchValue} onChange={event => setMatchValue(event.target.value)} disabled={matchType === 'default'} placeholder={matchType === 'default' ? 'Не требуется' : 'yandex / cpc / campaign'} className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:disabled:bg-slate-800" />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500 md:col-span-2">Показывать номер
              <select value={phoneNumberId} onChange={event => setPhoneNumberId(event.target.value)} className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <option value="">Выберите номер</option>
                {siteNumbers.map(phone => <option key={phone.id} value={phone.id}>{phone.phoneLabel || phone.phoneDisplay} — {phone.phoneDisplay}</option>)}
              </select>
            </label>
          </div>
          <button onClick={saveRule} disabled={savingRule || !siteId || !phoneNumberId} className="mt-3 inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{savingRule ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}Добавить правило</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950/50"><tr><th className="px-3 py-2">Номер</th><th className="px-3 py-2">DID</th><th className="px-3 py-2">Статус</th><th className="px-3 py-2">Действие</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {siteNumbers.map(phone => <tr key={phone.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40"><td className="px-3 py-3"><div className="font-black text-slate-800 dark:text-slate-100">{safeText(phone.phoneLabel)}</div><div className="font-mono text-slate-500">{safeText(phone.phoneDisplay)}</div></td><td className="px-3 py-3 font-mono text-slate-500">{safeText(phone.did)}</td><td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', statusClass(phone.isActive)].join(' ')}>{phone.isActive ? 'Активен' : 'Выключен'}</span></td><td className="px-3 py-3"><button onClick={() => togglePhone(phone)} disabled={updatingId === phone.id} className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{updatingId === phone.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Power className="mr-1.5 h-3 w-3" />}{phone.isActive ? 'Выключить' : 'Включить'}</button></td></tr>)}
              {!siteNumbers.length && <tr><td colSpan={4} className="px-3 py-6 text-center font-bold text-slate-500">{loading ? 'Загрузка...' : 'Номера еще не добавлены'}</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950/50"><tr><th className="px-3 py-2">Правило</th><th className="px-3 py-2">Условие</th><th className="px-3 py-2">Номер</th><th className="px-3 py-2">Статус</th><th className="px-3 py-2">Действие</th></tr></thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {siteRules.map(rule => <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40"><td className="px-3 py-3"><div className="font-black text-slate-800 dark:text-slate-100">{safeText(rule.ruleName)}</div><div className="font-mono text-slate-500">priority {rule.priority}</div></td><td className="px-3 py-3"><div className="font-black text-slate-700 dark:text-slate-200">{matchTypeLabel(rule.matchType)}</div><div className="max-w-[220px] truncate text-slate-500" title={rule.matchValue}>{rule.matchType === 'default' ? 'fallback' : safeText(rule.matchValue)}</div></td><td className="px-3 py-3 font-mono text-slate-500">{safeText(phoneName(rule.phoneNumberId))}</td><td className="px-3 py-3"><span className={['rounded-full px-2 py-1 text-[10px] font-black', statusClass(rule.isActive)].join(' ')}>{rule.isActive ? 'Активно' : 'Выключено'}</span></td><td className="px-3 py-3"><button onClick={() => toggleRule(rule)} disabled={updatingId === rule.id} className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{updatingId === rule.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Power className="mr-1.5 h-3 w-3" />}{rule.isActive ? 'Выключить' : 'Включить'}</button></td></tr>)}
              {!siteRules.length && <tr><td colSpan={5} className="px-3 py-6 text-center font-bold text-slate-500">{loading ? 'Загрузка...' : 'Правила еще не добавлены'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
        <div className="text-sm font-black text-slate-900 dark:text-white">Инструкция для сайта</div>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">Добавьте атрибуты к номеру, который можно подменять. Если API недоступно или правило не найдено, посетитель увидит исходный номер из HTML.</p>
        <pre className="mt-3 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-3 text-[10px] font-semibold text-slate-100"><code>{dataAttributeExample}</code></pre>
        <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Скрипт также может заменить обычные ссылки <span className="font-mono">tel:</span>. Чтобы отключить это поведение, добавьте к script тегу <span className="font-mono">data-replace-tel-links=&quot;false&quot;</span>.</p>
      </div>
    </div>
  );
}
