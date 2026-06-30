import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Code2, LineChart, Loader2, Megaphone, PlugZap, XCircle } from 'lucide-react';
import { CalltrackingSite, YandexDirectSettings, YandexMetrikaCounter, YandexMetrikaGoal, YandexMetrikaGoals, YandexMetrikaIntegration } from './types';

const baseIntegrations = [
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
    emailClickGoalId: goals?.emailClickGoalId || '',
    leadFormGoalId: goals?.leadFormGoalId || ''
  };
}

function metrikaStatusLabel(integration?: YandexMetrikaIntegration, countersLoaded = false, loading = false): string {
  if (loading) return 'Загрузка подключений…';
  if (!integration && countersLoaded) return 'Счетчики загружены';
  if (!integration) return 'Не подключено';
  if (integration.tokenStatus === 'valid') return 'Подключено';
  if (integration.tokenStatus === 'invalid' || integration.tokenStatus === 'error') return 'Ошибка';
  return 'Сохранено, проверьте подключение';
}

function metrikaStatusClass(integration?: YandexMetrikaIntegration, countersLoaded = false, loading = false): string {
  if (loading) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (!integration && countersLoaded) return 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300';
  if (!integration) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  if (integration.tokenStatus === 'valid') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (integration.tokenStatus === 'invalid' || integration.tokenStatus === 'error') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
}

function normalizeDirectSettings(direct?: YandexDirectSettings | null): YandexDirectSettings {
  return {
    enabled: direct?.enabled === true,
    clientLogins: Array.isArray(direct?.clientLogins) ? direct.clientLogins : [],
    lastSyncAt: direct?.lastSyncAt || null,
    lastError: direct?.lastError || null
  };
}

function mappedGoalsCount(goals?: YandexMetrikaGoals | null): number {
  return Object.values(normalizeGoals(goals)).filter(Boolean).length;
}

function goalsStatusLabel(goals?: YandexMetrikaGoals | null): string {
  const count = mappedGoalsCount(goals);
  if (count === 0) return 'Цели Метрики еще не сопоставлены с действиями PBXPuls';
  if (count === 5) return 'Цели сопоставлены';
  return 'Цели сопоставлены частично';
}

function phoneGoalLabel(integration: YandexMetrikaIntegration | null | undefined, goals: YandexMetrikaGoal[]): string {
  const goalId = normalizeGoals(integration?.goals).phoneClickGoalId;
  if (!goalId) return '';
  const goal = goals.find(item => String(item.id) === String(goalId));
  return (goal?.name ? goal.name + ' — ' : '') + goalId;
}

function directStatusLabel(integration?: YandexMetrikaIntegration): string {
  if (!integration) return 'Сначала подключите Метрику';
  const direct = normalizeDirectSettings(integration.direct);
  if (direct.lastError) return 'Ошибка';
  return direct.enabled ? 'Подключено' : 'Не подключено';
}

function directStatusClass(integration?: YandexMetrikaIntegration): string {
  if (!integration) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  const direct = normalizeDirectSettings(integration.direct);
  if (direct.lastError) return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  return direct.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
}

interface MarketingIntegrationsPanelProps {
  sites?: CalltrackingSite[];
  metrikaIntegrations?: YandexMetrikaIntegration[];
  onMetrikaChanged?: () => void;
  loadingIntegrations?: boolean;
  integrationsError?: string;
}

export function MarketingIntegrationsPanel({ sites = [], metrikaIntegrations = [], onMetrikaChanged, loadingIntegrations = false, integrationsError = '' }: MarketingIntegrationsPanelProps) {
  const safeSites = Array.isArray(sites) ? sites : [];
  const safeMetrikaIntegrations = Array.isArray(metrikaIntegrations) ? metrikaIntegrations : [];
  const primarySite = safeSites[0];
  const siteKey = primarySite?.publicKey || 'SITE_PUBLIC_KEY';
  const activeMetrika = safeMetrikaIntegrations[0];
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
  const [showManualMetrika, setShowManualMetrika] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<'none' | 'pending' | 'success' | 'error'>('none');
  const [oauthCounters, setOauthCounters] = useState<YandexMetrikaCounter[]>([]);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [connectingYandex, setConnectingYandex] = useState(false);
  const [oauthStatusLoading, setOauthStatusLoading] = useState(false);
  const [refreshCountersLoading, setRefreshCountersLoading] = useState(false);
  const [connectingCounter, setConnectingCounter] = useState(false);
  const [selectedOAuthCounterId, setSelectedOAuthCounterId] = useState(activeMetrika?.counterId || '');
  const [goalsByIntegrationId, setGoalsByIntegrationId] = useState<Record<string, YandexMetrikaGoal[]>>({});
  const [goalMappingsByIntegrationId, setGoalMappingsByIntegrationId] = useState<Record<string, Required<YandexMetrikaGoals>>>({});
  const [goalFiltersByIntegrationId, setGoalFiltersByIntegrationId] = useState<Record<string, string>>({});
  const [goalsLoadedByIntegrationId, setGoalsLoadedByIntegrationId] = useState<Record<string, boolean>>({});
  const [goalsLoadingByIntegrationId, setGoalsLoadingByIntegrationId] = useState<Record<string, boolean>>({});
  const [goalsSavingByIntegrationId, setGoalsSavingByIntegrationId] = useState<Record<string, boolean>>({});
  const [goalsErrorByIntegrationId, setGoalsErrorByIntegrationId] = useState<Record<string, string | null>>({});
  const [disconnectingYandexIntegrationId, setDisconnectingYandexIntegrationId] = useState<string | null>(null);
  const [directEnabled, setDirectEnabled] = useState(normalizeDirectSettings(activeMetrika?.direct).enabled);
  const [directClientLogins, setDirectClientLogins] = useState(normalizeDirectSettings(activeMetrika?.direct).clientLogins.join('\n'));
  const [savingDirect, setSavingDirect] = useState(false);
  const [testingDirect, setTestingDirect] = useState(false);
  const [directMessage, setDirectMessage] = useState('');

  const selectedIntegration = useMemo(() => {
    return safeMetrikaIntegrations.find(item => item.siteId === siteId && item.counterId === counterId) || activeMetrika;
  }, [activeMetrika, counterId, safeMetrikaIntegrations, siteId]);
  const countersLoaded = counters.length > 0;
  const hasAnyGoal = Object.values(goals).some(Boolean);
  const activeDirect = normalizeDirectSettings(activeMetrika?.direct);
  const oauthCounter = oauthCounters.find(counter => counter.counterId === selectedOAuthCounterId);
  const yandexActionLoading = connectingYandex || oauthStatusLoading || refreshCountersLoading;
  const primarySiteName = activeMetrika ? (safeSites.find(site => site.id === activeMetrika.siteId)?.name || safeSites.find(site => site.id === activeMetrika.siteId)?.domain || activeMetrika.siteId) : '';

  useEffect(() => {
    if (!siteId && primarySite?.id) setSiteId(primarySite.id);
    if (activeMetrika?.counterId) {
      setCounterId(activeMetrika.counterId);
      setSelectedCounterId(activeMetrika.counterId);
      setSelectedOAuthCounterId(activeMetrika.counterId);
    }
    if (activeMetrika?.domain) setDomain(activeMetrika.domain);
    if (activeMetrika?.name || primarySite?.name) setName(activeMetrika?.name || primarySite?.name || 'Основной сайт');
    setGoals(normalizeGoals(activeMetrika?.goals));
    safeMetrikaIntegrations.forEach(integration => {
      setGoalMappingsByIntegrationId(current => current[integration.id] ? current : ({ ...current, [integration.id]: normalizeGoals(integration.goals) }));
    });
    const direct = normalizeDirectSettings(activeMetrika?.direct);
    setDirectEnabled(direct.enabled);
    setDirectClientLogins(direct.clientLogins.join('\n'));
  }, [activeMetrika?.counterId, activeMetrika?.direct, activeMetrika?.domain, activeMetrika?.goals, activeMetrika?.name, counterId, domain, name, primarySite?.id, primarySite?.name, siteId]);

  const loadYandexOAuthStatus = async (mode: 'callback' | 'refresh' = 'callback') => {
    if (mode === 'refresh') setRefreshCountersLoading(true);
    else setOauthStatusLoading(true);
    setConnectingYandex(false);
    setConnectingCounter(false);
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/yandex/oauth/status', { headers: { Authorization: 'Bearer ' + token } });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Не удалось получить статус OAuth.');
      const loadedCounters = Array.isArray(json.counters) ? json.counters : [];
      setOauthStatus(json.status || 'none');
      setOauthCounters(loadedCounters);
      setOauthError(json.error || null);
      if (activeMetrika?.counterId) setSelectedOAuthCounterId(activeMetrika.counterId);
      else if (loadedCounters.length && !selectedOAuthCounterId) setSelectedOAuthCounterId(loadedCounters[0].counterId);
      if (json.status === 'success') setMessage('Яндекс авторизован. Выберите счетчик Метрики.');
      if (json.status === 'error') setMessage(json.error || 'OAuth Яндекса завершился с ошибкой.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setOauthStatus('error');
      setOauthError(error?.message || 'Не удалось получить статус OAuth.');
      setMessage(error?.message || 'Не удалось получить статус OAuth.');
    } finally {
      if (mode === 'refresh') setRefreshCountersLoading(false);
      else setOauthStatusLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('yandexOAuth')) {
      loadYandexOAuthStatus('callback');
      params.delete('yandexOAuth');
      params.delete('message');
      params.delete('state');
      const nextQuery = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (nextQuery ? '?' + nextQuery : '') + window.location.hash);
    }
  }, []);

  const startYandexOAuth = async () => {
    if (yandexActionLoading) return;
    setConnectingYandex(true);
    setMessage('');
    setOauthError(null);
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = window.setTimeout(() => controller?.abort(), 15000);
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/yandex/oauth/url', {
        headers: { Authorization: 'Bearer ' + token },
        signal: controller?.signal
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Не удалось сформировать ссылку OAuth.');
      if (!json.configured) throw new Error(json.error || 'YANDEX_CLIENT_ID is not configured');
      if (!json.url) throw new Error('OAuth URL is empty');
      window.location.assign(json.url);
    } catch (error: any) {
      const message = error?.name === 'AbortError' ? 'Не удалось получить OAuth URL за 15 секунд.' : (error?.message || 'Не удалось подключить Яндекс.');
      setOauthStatus('error');
      setOauthError(message);
      setMessage(message);
      setConnectingYandex(false);
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const connectOAuthCounter = async () => {
    const counter = oauthCounter;
    if (!counter) {
      setMessage('Выберите счетчик Яндекс.Метрики.');
      return;
    }
    setConnectingCounter(true);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/yandex/connect-counter', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, counterId: selectedOAuthCounterId, siteName: counter.domain || counter.name, domain: counter.domain || '', name: counter.name || counter.domain || 'Яндекс.Метрика', goals })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось выбрать счетчик.');
      setCounterId(counter.counterId);
      setDomain(counter.domain || '');
      setName(counter.name || name);
      setSelectedCounterId(counter.counterId);
      setMessage('Яндекс подключен. Счетчик выбран.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось выбрать счетчик.');
    } finally {
      setConnectingCounter(false);
    }
  };

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

  const saveDirectSettings = async () => {
    if (!activeMetrika?.id) {
      setDirectMessage('Сначала подключите Яндекс.Метрику.');
      return;
    }
    setSavingDirect(true);
    setDirectMessage('');
    try {
      const clientLogins = directClientLogins.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
      const token = getAuthToken();
      const response = await fetch('/api/marketing/direct/settings', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: activeMetrika.id, enabled: directEnabled, clientLogins })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось сохранить настройки Директа.');
      setDirectMessage('Настройки Директа сохранены.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setDirectMessage(error?.message || 'Не удалось сохранить настройки Директа.');
    } finally {
      setSavingDirect(false);
    }
  };

  const testDirect = async () => {
    if (!activeMetrika?.id) {
      setDirectMessage('Сначала подключите Яндекс.Метрику.');
      return;
    }
    setTestingDirect(true);
    setDirectMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/direct/test', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId: activeMetrika.id })
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось проверить расходы Директа.');
      if (json.status === 'connected_limited' || json.status === 'connected_no_data') {
        setDirectMessage(json.warning || 'Данные Директа подключены, но сумма расходов через текущий API недоступна. Загружены визиты/кампании Директа: ' + safeText(json.sample?.directVisits ?? json.sample?.clicks));
      } else {
        setDirectMessage('Расходы доступны. Пример: ' + safeText(json.sample?.cost) + ' ₽, кликов: ' + safeText(json.sample?.clicks));
      }
      onMetrikaChanged?.();
    } catch (error: any) {
      setDirectMessage(error?.message || 'Не удалось проверить расходы Директа.');
      onMetrikaChanged?.();
    } finally {
      setTestingDirect(false);
    }
  };

  const loadMetrikaGoals = async (integration: YandexMetrikaIntegration) => {
    if (!integration?.id) return;
    setGoalsLoadingByIntegrationId(current => ({ ...current, [integration.id]: true }));
    setGoalsErrorByIntegrationId(current => ({ ...current, [integration.id]: null }));
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/metrika/integrations/' + integration.id + '/goals', { headers: { Authorization: 'Bearer ' + token } });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Не удалось загрузить цели Метрики.');
      const loadedGoals = Array.isArray(json.goals) ? json.goals : [];
      setGoalsByIntegrationId(current => ({ ...current, [integration.id]: loadedGoals }));
      setGoalMappingsByIntegrationId(current => ({ ...current, [integration.id]: normalizeGoals(json.mappedGoals || integration.goals) }));
      setGoalsLoadedByIntegrationId(current => ({ ...current, [integration.id]: true }));
    } catch (error: any) {
      setGoalsErrorByIntegrationId(current => ({ ...current, [integration.id]: error?.message || 'Не удалось загрузить цели Метрики.' }));
      setGoalsLoadedByIntegrationId(current => ({ ...current, [integration.id]: true }));
    } finally {
      setGoalsLoadingByIntegrationId(current => ({ ...current, [integration.id]: false }));
    }
  };

  const saveMetrikaGoalMapping = async (integration: YandexMetrikaIntegration) => {
    if (!integration?.id) return;
    setGoalsSavingByIntegrationId(current => ({ ...current, [integration.id]: true }));
    setGoalsErrorByIntegrationId(current => ({ ...current, [integration.id]: null }));
    try {
      const token = getAuthToken();
      const mapping = goalMappingsByIntegrationId[integration.id] || normalizeGoals(integration.goals);
      const response = await fetch('/api/marketing/metrika/integrations/' + integration.id + '/goals', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping)
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось сохранить сопоставление целей.');
      setMessage('Сопоставление целей сохранено.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setGoalsErrorByIntegrationId(current => ({ ...current, [integration.id]: error?.message || 'Не удалось сохранить сопоставление целей.' }));
    } finally {
      setGoalsSavingByIntegrationId(current => ({ ...current, [integration.id]: false }));
    }
  };

  const disconnectYandex = async (integration: YandexMetrikaIntegration) => {
    if (!integration?.id) return;
    const label = integration.domain || integration.name || integration.counterId;
    const confirmed = window.confirm('Отключить Яндекс.Метрику для сайта ' + label + '? Токен доступа будет удален, Метрика и расходы Директа перестанут обновляться. История звонков и событий PBXPuls сохранится.');
    if (!confirmed) return;
    setDisconnectingYandexIntegrationId(integration.id);
    setMessage('');
    try {
      const token = getAuthToken();
      const response = await fetch('/api/marketing/metrika/integrations/' + integration.id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token }
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || 'Не удалось отключить Яндекс.');
      setMessage('Яндекс отключен. История PBXPuls сохранена.');
      onMetrikaChanged?.();
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отключить Яндекс.');
    } finally {
      setDisconnectingYandexIntegrationId(null);
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
            <span className={['rounded-full px-2 py-1 text-[10px] font-black', metrikaStatusClass(activeMetrika, countersLoaded, loadingIntegrations)].join(' ')}>{metrikaStatusLabel(activeMetrika, countersLoaded, loadingIntegrations)}</span>
          </div>
          <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">Яндекс</div>
          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Подключение Яндекса выполняется через OAuth. PBXPuls не показывает токен в интерфейсе. Для чтения статистики нужны права metrika:read.</div>
          {loadingIntegrations ? (
            <div className="mt-3 rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">Загрузка подключений…</div>
          ) : integrationsError ? (
            <div className="mt-3 break-words rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{safeText(integrationsError)}</div>
          ) : (
          <div className="mt-3 space-y-1 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div>Домен: <span className="text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.domain)}</span></div>
            <div>Счетчик: <span className="font-mono text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.counterId)}</span></div>
            <div>Сайт PBXPuls: <span className="text-slate-800 dark:text-slate-100">{safeText(primarySiteName)}</span></div>
            <div>Название: <span className="text-slate-800 dark:text-slate-100">{safeText(activeMetrika?.name)}</span></div>
            <div>Проверка: <span className="text-slate-700 dark:text-slate-200">{formatDateTime(activeMetrika?.lastSyncAt)}</span></div>
            <div>Цели: <span className={mappedGoalsCount(activeMetrika?.goals) > 0 ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500'}>{goalsStatusLabel(activeMetrika?.goals)}</span></div>
            {phoneGoalLabel(activeMetrika, goalsByIntegrationId[activeMetrika?.id || ''] || []) && <div>Цель звонка сопоставлена: <span className="break-words text-slate-800 dark:text-slate-100">{phoneGoalLabel(activeMetrika, goalsByIntegrationId[activeMetrika?.id || ''] || [])}</span></div>}
            {activeMetrika?.lastError && <div className="rounded-xl bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{safeText(activeMetrika.lastError)}</div>}
            {safeMetrikaIntegrations.length > 1 && (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                {safeMetrikaIntegrations.map(integration => (
                  <div key={integration.id} className="min-w-0 break-words text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    {safeText(integration.domain || integration.siteId)} — <span className="font-mono">{safeText(integration.counterId)}</span> — {safeText(integration.name)}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
          <div className="mt-4 space-y-2">
            <button onClick={startYandexOAuth} disabled={yandexActionLoading || loadingIntegrations} className="inline-flex h-9 w-full max-w-full items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{connectingYandex && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{activeMetrika ? 'Переподключить Яндекс' : 'Подключить Яндекс'}</button>
            <button onClick={() => loadYandexOAuthStatus('refresh')} disabled={yandexActionLoading || loadingIntegrations} className="inline-flex h-9 w-full max-w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{refreshCountersLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Обновить счетчики</button>
            {activeMetrika && <button onClick={() => disconnectYandex(activeMetrika)} disabled={Boolean(disconnectingYandexIntegrationId) || loadingIntegrations} className="inline-flex h-9 w-full max-w-full items-center justify-center rounded-xl border border-rose-200 bg-white px-3 text-xs font-black text-rose-700 shadow-sm disabled:opacity-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300">{disconnectingYandexIntegrationId === activeMetrika.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Отключить Яндекс</button>}
          </div>
          {activeMetrika && (
            <div className="mt-4 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <button type="button" onClick={() => setShowGoals(value => !value)} className="w-full text-left text-xs font-black text-slate-700 dark:text-slate-200">Цели Метрики</button>
              {showGoals && safeMetrikaIntegrations.map(integration => {
                const integrationGoals = goalsByIntegrationId[integration.id] || [];
                const mapping = goalMappingsByIntegrationId[integration.id] || normalizeGoals(integration.goals);
                const filter = goalFiltersByIntegrationId[integration.id] || '';
                const filteredGoals = integrationGoals.filter(goal => (goal.name + ' ' + goal.id).toLowerCase().includes(filter.toLowerCase()));
                const mappedCount = Object.values(mapping).filter(Boolean).length;
                const isLoadingGoals = goalsLoadingByIntegrationId[integration.id] === true;
                const isSavingGoals = goalsSavingByIntegrationId[integration.id] === true;
                const goalsLoaded = goalsLoadedByIntegrationId[integration.id] === true;
                const goalsError = goalsErrorByIntegrationId[integration.id];
                const goalStatusText = isLoadingGoals
                  ? 'Загружаем цели Метрики…'
                  : goalsError
                    ? goalsError
                    : !goalsLoaded
                      ? 'Цели Метрики еще не загружались. Нажмите «Загрузить цели Метрики».'
                      : integrationGoals.length > 0 && mappedCount === 0
                        ? 'В Метрике найдено ' + integrationGoals.length + ' целей. Сопоставьте нужные цели с действиями PBXPuls.'
                        : integrationGoals.length > 0
                          ? 'Цели найдены: ' + integrationGoals.length + '. Сопоставлено: ' + mappedCount + '.'
                          : 'В счетчике Метрики цели не найдены.';
                const goalSelects = [
                  ['phoneClickGoalId', 'Цель для клика по телефону'],
                  ['whatsappClickGoalId', 'Цель для WhatsApp'],
                  ['telegramClickGoalId', 'Цель для Telegram'],
                  ['emailClickGoalId', 'Цель для email'],
                  ['leadFormGoalId', 'Цель для заявки/формы']
                ] as const;
                return (
                  <div key={integration.id} className="mt-3 min-w-0 space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                    <div className="break-words text-[11px] font-black uppercase tracking-wide text-slate-500">{safeText(integration.domain || integration.siteId)} — {safeText(integration.counterId)}</div>
                    <div className={['break-words text-xs font-bold', goalsError ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'].join(' ')}>{goalStatusText}</div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => loadMetrikaGoals(integration)} disabled={isLoadingGoals} className="inline-flex h-9 max-w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{isLoadingGoals && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{goalsLoaded ? 'Обновить цели' : 'Загрузить цели Метрики'}</button>
                    </div>
                    {integrationGoals.length > 8 && <input value={filter} onChange={event => setGoalFiltersByIntegrationId(current => ({ ...current, [integration.id]: event.target.value }))} placeholder="Фильтр целей" className="h-9 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />}
                    {integrationGoals.length > 0 && (
                      <div className="grid grid-cols-1 gap-3">
                        {goalSelects.map(([key, label]) => (
                          <label key={key} className="block min-w-0 text-[11px] font-black uppercase tracking-wide text-slate-500">
                            {label}
                            <select value={mapping[key] || ''} onChange={event => setGoalMappingsByIntegrationId(current => ({ ...current, [integration.id]: { ...(current[integration.id] || normalizeGoals(integration.goals)), [key]: event.target.value || '' } }))} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                              <option value="">Не выбрано</option>
                              {filteredGoals.map(goal => <option key={goal.id} value={goal.id}>{goal.name + ' — ' + goal.id}</option>)}
                            </select>
                          </label>
                        ))}
                        <button type="button" onClick={() => saveMetrikaGoalMapping(integration)} disabled={isSavingGoals} className="inline-flex h-9 max-w-full items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{isSavingGoals && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Сохранить сопоставление целей</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {oauthStatus === 'success' && oauthCounters.length > 0 && (
            <div className="mt-4 max-w-full break-words rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              Яндекс авторизован. Выберите счетчик Метрики.
            </div>
          )}

          {oauthCounters.length > 0 && (
            <div className="mt-4 max-w-full space-y-3 overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Доступные счетчики</label>
              <select value={selectedOAuthCounterId} onChange={event => setSelectedOAuthCounterId(event.target.value)} className="h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {oauthCounters.map(counter => <option key={counter.counterId} value={counter.counterId}>{formatCounterOption(counter)}</option>)}
              </select>
              <button onClick={connectOAuthCounter} disabled={connectingCounter || !selectedOAuthCounterId} className="inline-flex h-9 max-w-full items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{connectingCounter && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Выбрать счетчик</button>
            </div>
          )}
          {oauthError && <div className="mt-3 break-words rounded-xl bg-rose-50 p-2 text-xs font-bold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{safeText(oauthError)}</div>}

          <button onClick={() => setShowManualMetrika(value => !value)} className="mt-4 h-9 w-full rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Ручное подключение / для администратора</button>
          {showManualMetrika && (
            <div className="mt-4 max-w-full space-y-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">Сайт PBXPuls</label>
                <select value={siteId} onChange={event => setSiteId(event.target.value)} className="mt-1 h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <option value="">Выберите сайт</option>
                  {safeSites.map(site => <option key={site.id} value={site.id}>{site.name || site.domain || site.id}</option>)}
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
                    ['emailClickGoalId', 'email_click goal ID'],
                    ['leadFormGoalId', 'lead_form goal ID']
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

        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 ring-1 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40">
              <Megaphone className="h-5 w-5" />
            </div>
            <span className={['rounded-full px-2 py-1 text-[10px] font-black', directStatusClass(activeMetrika)].join(' ')}>{directStatusLabel(activeMetrika)}</span>
          </div>
          <div className="mt-4 text-sm font-black text-slate-900 dark:text-white">Яндекс Директ / расходы</div>
          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">Расходы берутся через API Яндекс.Метрики по связанным кампаниям Директа. Если данных нет, проверьте доступы и client logins.</div>
          {!activeMetrika ? (
            <div className="mt-3 rounded-xl bg-slate-100 p-3 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Сначала подключите Яндекс.Метрику</div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={directEnabled} onChange={event => setDirectEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                <span className="min-w-0 break-words">Учитывать расходы Яндекс Директа</span>
              </label>
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">client logins</label>
                <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Укажите логин рекламного аккаунта Яндекс.Директа без @yandex.ru. Для агентских аккаунтов можно указать несколько логинов с новой строки. Для расходов Директа укажите clientLogin рекламного аккаунта.</p>
                <textarea value={directClientLogins} onChange={event => setDirectClientLogins(event.target.value)} rows={3} placeholder="client-login-1
client-login-2" className="mt-1 w-full min-w-0 resize-y rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" />
              </div>
              <div className="space-y-1 break-words text-xs font-semibold text-slate-500 dark:text-slate-400">
                <div>Последняя проверка: <span className="text-slate-700 dark:text-slate-200">{formatDateTime(activeDirect.lastSyncAt)}</span></div>
                {activeDirect.lastError && <div className="rounded-xl bg-rose-50 p-2 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{safeText(activeDirect.lastError)}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={saveDirectSettings} disabled={savingDirect} className="inline-flex h-9 max-w-full items-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50">{savingDirect && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Сохранить настройки Директа</button>
                <button onClick={testDirect} disabled={testingDirect || !directEnabled} className="inline-flex h-9 max-w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">{testingDirect && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Проверить расходы</button>
              </div>
              {directMessage && <div className="break-words rounded-xl bg-slate-50 p-2 text-xs font-bold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{directMessage}</div>}
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
