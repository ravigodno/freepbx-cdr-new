import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Code2, LineChart, Loader2, Megaphone, PlugZap, XCircle } from 'lucide-react';
import { CalltrackingSite, YandexMetrikaCounter, YandexMetrikaGoals, YandexMetrikaIntegration } from './types';

const baseIntegrations = [
  { title: 'Яндекс Директ', description: 'Импорт расходов, кампаний и ключевых связок.', icon: Megaphone, action: 'Скоро' },
  { title: 'CRM / Bitrix24', description: 'Передача звонков и лидов в CRM на следующих этапах.', icon: PlugZap, action: 'Скоро' },
  { title: 'Уведомления', description: 'Оповещения о потерянных рекламных обращениях.', icon: Bell, action: 'Скоро' }
];

function safeText(value: unknown): string {
  const text = String(value || '').trim();
  return text || '—';
}

function getAuthToken(): string {
  const sessionSaved = localStorage.getItem('asterisk_cdr_session');
  if (!sessionSaved) return '';
  try { return JSON.parse(sessionSaved)?.token || ''; } catch { return ''; }
}

function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU');
}

function formatCounterOption(counter: YandexMetrikaCounter): string {
  const parts = counter.domain ? [counter.domain, counter.counterId, counter.name] : [counter.counterId, counter.name];
  return parts.map(part => String(part || '').trim()).filter(Boolean).join(' — ');
}

function normalizeGoals(goals?: YandexMetrikaGoals | null): Required<YandexMetrikaGoals> {
  return {
    phoneClickGoalId: goals?.phoneClickGoalId || '',
    whatsappClickGoalId: goals?.whatsappClickGoalId || '',
    telegramClickGoalId: goals?.telegramClickGoalId || '',
    emailClickGoalId: goals?.emailClickGoalId || ''
  };
}

function metrikaStatusLabel(integration?: YandexMetrikaIntegration, countersLoaded = false): string {
  if (!integration && countersLoaded) return 'Счетчики загружены';
  if (!integration) return 'Не подключено';
  if (integration.tokenStatus === 'valid') return 'Подключено';
  if (integration.tokenStatus === 'invalid' || integration.tokenStatus === 'error') return 'Ошибка';
  return 'Сохранено, проверьте подключение';
}

function metrikaStatusClass(integration?: YandexMetrikaIntegration, countersLoaded = false): string {
  if (!integration && countersLoaded) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (!integration) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  if (integration.tokenStatus === 'valid') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (integration.tokenStatus === 'invalid' || integration.tokenStatus === 'error') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
}

function goalsStatusLabel(goals?: YandexMetrikaGoals | null): string {
  const normalized = normalizeGoals(goals);
  const count = Object.values(normalized).filter(Boolean).length;
  if (count === 0) return 'Цели Метрики не настроены';
  if (count === 4) return 'Цели настроены';
  return 'Цели Метрики настроены частично';
}

interface MarketingIntegrationsPanelProps {
  sites?: CalltrackingSite[];
  metrikaIntegrations?: YandexMetrikaIntegration[];
  onMetrikaChanged?: () => void;
}

export function MarketingIntegrationsPanel({ sites = [], metrikaIntegrations = [], onMetrikaChanged }: MarketingIntegrationsPanelProps) {
  const primarySite = sites[0];
  const siteKey = primarySite?.publicKey || 'SITE_PUBLIC_KEY';
  const activeMetrika = metrikaIntegrations[0];
  const scriptExample = '<script src="https://PBXPULS_HOST/calltracking.js" data-site-key="' + siteKey + '"></script>';
  const debugScriptExample = '<script src="https://PBXPULS_HOST/calltracking.js" data-site-key="' + siteKey + '" data-debug="true"></script>';
  const metrikaScriptExample = '<script src="https://PBXPULS_HOST/calltracking.js" data-site-key="' + siteKey + '" data-ym-counter-id="12345678"></script>';

  const [showMetrikaForm, setShowMetrikaForm] = useState(false);
  const [siteId, setSiteId] = useState(primarySite?.id || '');
  const [counterId, setCounterId] = useState(activeMetrika?.counterId || primarySite?.counterId || '');
  const [domain, setDomain] = useState(activeMetrika?.domain || '');
  const [name, setName] = useState(activeMetrika?.name || primarySite?.name || 'Основной сайт');
  const [accessToken, setAccessToken] = useState('');
  const [counters, setCounters] = useState<YandexMetrikaCounter[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState(activeMetrika?.counterId || '');
  const [manualCounterMode, setManualCounterMode] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [goals, setGoals] = useState<Required<YandexMetrikaGoals>>(normalizeGoals(activeMetrika?.goals));
  const [loadingCounters, setLoadingCounters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  const selectedIntegration = useMemo(() => {
    return metrikaIntegrations.find(item => item.siteId === siteId && item.counterId === counterId) || activeMetrika;
  }, [activeMetrika, counterId, metrikaIntegrations, siteId]);
  const countersLoaded = counters.length > 0;
  const hasAnyGoal = Object.values(goals).some(Boolean);

  useEffect(() => {
    if (!siteId && primarySite?.id) setSiteId(primarySite.id);
    if (!counterId && activeMetrika?.counterId) setCounterId(activeMetrika.counterId);
    if (!domain && activeMetrika?.domain) setDomain(activeMetrika.domain);
    if (!name && (activeMetrika?.name || primarySite?.name)) setName(activeMetrika?.name || primarySite?.name || 'Основной сайт');
    setGoals(normalizeGoals(activeMetrika?.goals));
  }, [activeMetrika?.counterId, activeMetrika?.domain, activeMetrika?.goals, activeMetrika?.name, counterId, domain, name, primarySite?.id, primarySite?.name, siteId]);

  const loadCounters = async () => {
    setLoadingCounters(true);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/metrika/counters', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось загрузить счетчики Метрики.');
      const loadedCounters = Array.isArray(json.counters) ? json.counters : [];
      setCounters(loadedCounters);
      setMessage(loadedCounters.length ? 'Счетчики загружены. Выберите нужный счетчик.' : 'Счетчики не найдены. Можно ввести Counter ID вручную.');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось загрузить счетчики Метрики.');
    } finally {
      setLoadingCounters(false);
    }
  };

  const selectCounter = (value: string) => {
    setSelectedCounterId(value);
    const counter = counters.find(item => item.counterId === value);
    if (!counter) return;
    setCounterId(counter.counterId);
    setDomain(counter.domain || '');
    if (!name || name === activeMetrika?.name || name === primarySite?.name) setName(counter.name || name);
  };

  const saveMetrika = async () => {
    setSaving(true);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/metrika/integrations', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, counterId, domain, name, accessToken, goals })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось сохранить подключение Метрики.');
      setAccessToken('');
      setMessage(json.integration?.tokenStatus === 'valid' ? 'Подключено.' : 'Сохранено, проверьте подключение.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось сохранить подключение Метрики.');
    } finally {
      setSaving(false);
    }
  };

  const testMetrika = async () => {
    const integrationId = selectedIntegration?.id;
    if (!integrationId) {
      setMessage('Сначала сохраните подключение Метрики.');
      return;
    }
    setTesting(true);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/metrika/integrations/' + integrationId + '/test', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Метрика вернула ошибку проверки.');
      setMessage('Подключение проверено.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Метрика вернула ошибку проверки.');
      onMetrikaChanged?.();
    } finally {
      setTesting(false);
    }
  };

  const canSave = Boolean(siteId && counterId && (/^\d+$/.test(counterId)) && (accessToken || selectedIntegration?.id));

  return (
    <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0">
        <h3 className="text-base font-black text-slate-950 dark:text-white">Интеграции</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Подключения сайта, Метрики и будущих рекламных источников</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-5">
        <div className="min-w-0 rounded-2xl border border-purple-100 bg-purple-50/50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-purple-600 ring-1 ring-purple-100 dark:bg-slate-900 dark:text-purple-300 dark:ring-purple-900/40">
              <Code2 className="h-5 w-5" />
            </div>
            <span className={['rounded-full px-2 py-1 text-[10px] font-black', primarySite ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'].join(' ')}>
              {primarySite ? 'Готово к установке' : 'Сайт не создан'}
            </span>
          </div>
          <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">JS-скрипт сайта</div>
          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Скрипт собирает просмотры страниц, показы телефонов и клики по телефону. Подмена номеров будет подключена отдельным этапом.</div>
          {primarySite && (
            <div className="mt-3 rounded-xl border border-purple-100 bg-white p-3 dark:border-purple-900/40 dark:bg-slate-900">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">siteKey</div>
              <div className="mt-1 break-all font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">{safeText(primarySite.publicKey)}</div>
            </div>
          )}
          <div className="mt-3 space-y-2">
            <div>
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Установка</div>
              <pre className="max-w-full overflow-x-auto rounded-xl bg-slate-950 p-3 text-[10px] font-semibold text-slate-100"><code>{scriptExample}</code></pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Debug-режим</div>
              <pre className="max-w-full overflow-x-auto rounded-xl bg-slate-950 p-3 text-[10px] font-semibold text-slate-100"><code>{debugScriptExample}</code></pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">С Яндекс.Метрикой</div>
              <pre className="max-w-full overflow-x-auto rounded-xl bg-slate-950 p-3 text-[10px] font-semibold text-slate-100"><code>{metrikaScriptExample}</code></pre>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40">
              <LineChart className="h-5 w-5" />
            </div>
            <span className={['rounded-full px-2 py-1 text-[10px] font-black', metrikaStatusClass(activeMetrika, countersLoaded)].join(' ')}>{metrikaStatusLabel(activeMetrika, countersLoaded)}</span>
          </div>
          <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">Яндекс.Метрика</div>
          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Импорт визитов, источников, страниц и базовых показателей поведения.</div>
          <div className="mt-3 space-y-1 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div>Домен: <span className="text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.domain)}</span></div>
            <div>Счетчик: <span className="font-mono text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.counterId)}</span></div>
            <div>Название: <span className="text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.name)}</span></div>
            <div>Проверка: <span className="text-slate-700 dark:text-slate-200">{formatDateTime(activeMetrika?.lastSyncAt)}</span></div>
            <div>Цели: <span className={hasAnyGoal || activeMetrika?.goals ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500'}>{goalsStatusLabel(activeMetrika?.goals)}</span></div>
            {activeMetrika?.lastError && <div className="rounded-xl bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{safeText(activeMetrika.lastError)}</div>}
          </div>
          <button onClick={() => setShowMetrikaForm(value => !value)} className="mt-4 h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Настроить</button>
          {showMetrikaForm && (
            <div className="mt-4 max-w-full space-y-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Сайт PBXPuls</label>
                <select value={siteId} onChange={event => setSiteId(event.target.value)} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <option value="">Выберите сайт</option>
                  {sites.map(site => <option key={site.id} value={site.id}>{site.name || site.domain || site.id}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">OAuth-токен Метрики</label>
                <input value={accessToken} onChange={event => setAccessToken(event.target.value)} type="password" autoComplete="off" placeholder="Токен не отображается после сохранения" className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Счетчик можно выбрать из списка после загрузки по OAuth-токену. Токен не отображается после сохранения.</p>
              </div>

              <button onClick={loadCounters} disabled={loadingCounters || !accessToken} className="inline-flex h-9 max-w-full items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">
                {loadingCounters && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Загрузить счетчики
              </button>

              {countersLoaded && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Счетчик Метрики</label>
                  <select value={selectedCounterId} onChange={event => selectCounter(event.target.value)} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <option value="">Выберите счетчик</option>
                    {counters.map(counter => <option key={counter.counterId} value={counter.counterId}>{formatCounterOption(counter)}</option>)}
                  </select>
                </div>
              )}

              <button type="button" onClick={() => setManualCounterMode(value => !value)} className="text-left text-xs font-black text-blue-600 dark:text-blue-300">Ввести counterId вручную</button>
              {manualCounterMode && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Counter ID</label>
                  <input value={counterId} onChange={event => setCounterId(event.target.value.replace(/\D/g, ''))} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Используйте ручной ввод, если счетчик не загрузился по токену. Counter ID можно ввести вручную, если список счетчиков не загрузился.</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Домен</label>
                  <input value={domain} onChange={event => setDomain(event.target.value)} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Название счетчика</label>
                  <input value={name} onChange={event => setName(event.target.value)} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                </div>
              </div>

              <button type="button" onClick={() => setShowGoals(value => !value)} className="text-left text-xs font-black text-slate-700 dark:text-slate-200">Дополнительные настройки целей</button>
              {showGoals && (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Цели можно настроить позже. Основная аналитика PBXPuls работает через собственные события calltracking.js. Goal ID нужны для сравнения целей Метрики с событиями PBXPuls.</p>
                  {([
                    ['phoneClickGoalId', 'phone_click goal ID'],
                    ['whatsappClickGoalId', 'whatsapp_click goal ID'],
                    ['telegramClickGoalId', 'telegram_click goal ID'],
                    ['emailClickGoalId', 'email_click goal ID']
                  ] as const).map(([key, label]) => (
                    <label key={key} className="block min-w-0 text-[11px] font-black uppercase tracking-wide text-slate-500">
                      {label}
                      <input value={goals[key] || ''} onChange={event => setGoals(current => ({ ...current, [key]: event.target.value.replace(/\D/g, '') }))} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
                    </label>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button onClick={saveMetrika} disabled={saving || !canSave} className="inline-flex h-9 max-w-full items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Сохранить подключение</button>
                <button onClick={testMetrika} disabled={testing || !selectedIntegration?.id} className="inline-flex h-9 max-w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{testing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : selectedIntegration?.tokenStatus === 'valid' ? <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> : <XCircle className="mr-2 h-3.5 w-3.5" />}Проверить подключение</button>
              </div>
              {message && <div className="break-words rounded-xl bg-slate-50 p-2 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{message}</div>}
            </div>
          )}
        </div>

        {baseIntegrations.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">Не подключено</span>
              </div>
              <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">{item.title}</div>
              <div className="mt-1 min-h-[42px] text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{item.description}</div>
              <button className="mt-4 h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{item.action}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
