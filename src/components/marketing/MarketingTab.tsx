import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, CheckCircle2, CircleDollarSign, Loader2, MousePointerClick, PhoneCall, PhoneMissed, Target, TrendingDown } from 'lucide-react';
import { MarketingFunnelChain } from './MarketingFunnelChain';
import { MarketingIntegrationsPanel } from './MarketingIntegrationsPanel';
import { MarketingKpiCard } from './MarketingKpiCard';
import { CampaignsReportTable, LostLeadsTable, PhoneClicksTable, TrafficSourcesTable } from './MarketingTables';
import { MarketingEmptyState } from './MarketingEmptyState';
import { CalltrackingSite, CalltrackingSummaryResponse, MarketingOverviewSummary, PhoneClickEvent, TrafficSourceSummary, UsedCallQualitySettings } from './types';

type MarketingTabId = 'overview' | 'phone-clicks' | 'sources' | 'campaigns' | 'pages' | 'utm' | 'lost-leads' | 'analytics' | 'integrations';

const tabs: Array<{ id: MarketingTabId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'phone-clicks', label: 'Клики по телефонам' },
  { id: 'sources', label: 'Источники' },
  { id: 'campaigns', label: 'Кампании' },
  { id: 'pages', label: 'Страницы' },
  { id: 'utm', label: 'UTM' },
  { id: 'lost-leads', label: 'Потерянные лиды' },
  { id: 'analytics', label: 'Сквозная аналитика' },
  { id: 'integrations', label: 'Интеграции' }
];

function getAuthToken(): string {
  const sessionSaved = localStorage.getItem('asterisk_cdr_session');
  if (!sessionSaved) return '';
  try { return JSON.parse(sessionSaved)?.token || ''; } catch { return ''; }
}

function formatMetric(value: number | null, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU') + suffix;
}

export default function MarketingTab() {
  const [activeTab, setActiveTab] = useState<MarketingTabId>('overview');
  const [summaryData, setSummaryData] = useState<CalltrackingSummaryResponse | null>(null);
  const [phoneClicks, setPhoneClicks] = useState<PhoneClickEvent[]>([]);
  const [sources, setSources] = useState<TrafficSourceSummary[]>([]);
  const [sites, setSites] = useState<CalltrackingSite[]>([]);
  const [usedSettings, setUsedSettings] = useState<UsedCallQualitySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadMarketing = async () => {
      try {
        setLoading(true);
        setError('');
        const token = getAuthToken();
        const headers = { Authorization: 'Bearer ' + token };
        const [summaryRes, eventsRes, sourcesRes, sitesRes] = await Promise.all([
          fetch('/api/calltracking/summary', { headers }),
          fetch('/api/calltracking/matches?limit=100', { headers }),
          fetch('/api/calltracking/sources', { headers }),
          fetch('/api/calltracking/sites', { headers })
        ]);
        if (!summaryRes.ok || !eventsRes.ok || !sourcesRes.ok || !sitesRes.ok) {
          throw new Error('Не удалось загрузить данные коллтрекинга.');
        }
        const [summaryJson, eventsJson, sourcesJson, sitesJson] = await Promise.all([
          summaryRes.json(), eventsRes.json(), sourcesRes.json(), sitesRes.json()
        ]);
        if (!active) return;
        setSummaryData(summaryJson.summary || null);
        setPhoneClicks(Array.isArray(eventsJson.matches) ? eventsJson.matches : []);
        setSources(Array.isArray(sourcesJson.sources) ? sourcesJson.sources : []);
        setSites(Array.isArray(sitesJson.sites) ? sitesJson.sites : []);
        setUsedSettings(summaryJson.usedSettings || eventsJson.usedSettings || sourcesJson.usedSettings || null);
      } catch (err: any) {
        if (active) setError(err?.message || 'Не удалось загрузить данные коллтрекинга.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMarketing();
    return () => { active = false; };
  }, []);

  const callbackSlaHours = usedSettings?.missedCallCallbackSlaHours ?? 24;

  const summary: MarketingOverviewSummary = useMemo(() => ({
    visits: summaryData ? Number(summaryData.uniqueSessions || summaryData.visits || 0) : null,
    phoneClicks: summaryData ? Number(summaryData.phoneClicks || 0) : null,
    siteCalls: summaryData ? Number(summaryData.siteCalls ?? summaryData.matchedCalls ?? 0) : null,
    clickToCallConversion: summaryData ? Number(summaryData.clickToCallConversion ?? 0) : null,
    missedSiteCalls: summaryData ? Number(summaryData.missedSiteCalls ?? 0) : null,
    lostLeads: summaryData ? Number(summaryData.trueLostLeads ?? summaryData.lostSiteCalls ?? 0) : null,
    adCost: null,
    lostBudgetEstimate: null
  }), [summaryData]);

  const kpis = useMemo(() => [
    { label: 'Визиты', value: formatMetric(summary.visits), hint: summaryData ? 'Уникальные sessionId из событий сайта' : 'Данные появятся после подключения скрипта коллтрекинга', icon: BarChart3, tone: 'blue' as const },
    { label: 'Клики по телефону', value: formatMetric(summary.phoneClicks), hint: summaryData ? 'Реальные события phone_click' : 'События сайта пока не собираются', icon: MousePointerClick, tone: 'purple' as const },
    { label: 'Звонки с сайта', value: formatMetric(summary.siteCalls), hint: summaryData ? 'Сопоставленные phone_click -> CDR' : 'Данные появятся после matching событий', icon: PhoneCall, tone: 'green' as const },
    { label: 'Конверсия клик → звонок', value: formatMetric(summary.clickToCallConversion, '%'), hint: 'Доля кликов, сопоставленных со звонками', icon: Target, tone: 'purple' as const },
    { label: 'Пропущенные звонки с сайта', value: formatMetric(summary.missedSiteCalls), hint: 'Сопоставленные звонки без успешного ответа', icon: PhoneMissed, tone: 'orange' as const },
    { label: 'Потерянные лиды', value: formatMetric(summary.lostLeads), hint: 'С учетом успешных перезвонов в течение ' + callbackSlaHours + ' ч', icon: TrendingDown, tone: 'red' as const },
    { label: 'Рекламный расход', value: formatMetric(summary.adCost, ' ₽'), hint: 'Интеграция с рекламными кабинетами позже', icon: CircleDollarSign, tone: 'blue' as const },
    { label: 'Потерянный бюджет', value: formatMetric(summary.lostBudgetEstimate, ' ₽'), hint: 'Оценка появится после импорта расходов', icon: Banknote, tone: 'red' as const }
  ], [summary, summaryData, callbackSlaHours]);

  const renderTab = () => {
    if (activeTab === 'phone-clicks') return <PhoneClicksTable events={phoneClicks} />;
    if (activeTab === 'sources') return <TrafficSourcesTable sources={sources} />;
    if (activeTab === 'campaigns') return <CampaignsReportTable />;
    if (activeTab === 'lost-leads') return <LostLeadsTable events={phoneClicks.filter(event => event.leadStatus === 'lost')} />;
    if (activeTab === 'integrations') return <MarketingIntegrationsPanel sites={sites} />;
    if (activeTab === 'pages') {
      return <MarketingEmptyState title="Данных по страницам пока нет" description="Статистика страниц появится после установки JS-скрипта PBXPuls на сайт." />;
    }
    if (activeTab === 'utm') {
      return <MarketingEmptyState title="UTM-данные пока не собираются" description="PBXPuls начнет показывать utm_source, utm_medium и utm_campaign после подключения коллтрекинга." />;
    }
    if (activeTab === 'analytics') {
      return <MarketingEmptyState title="Сквозная аналитика пока не подключена" description="Следующие этапы свяжут расходы, визиты, звонки, ответы и потерянные обращения." />;
    }

    return (
      <div className="space-y-4">
        <MarketingFunnelChain />
        <div className="grid gap-4 xl:grid-cols-2">
          <PhoneClicksTable events={phoneClicks} />
          <TrafficSourcesTable sources={sources} />
        </div>
        <MarketingIntegrationsPanel sites={sites} />
      </div>
    );
  };

  return (
    <section className="w-full space-y-4" id="marketing-tab-container">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">
              <Target className="h-3.5 w-3.5" /> PBXPuls Calltracking
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">Маркетинг и коллтрекинг</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500 dark:text-slate-400">Связь рекламы, сайта и звонков в единую цепочку эффективности</p>
          </div>
          <div className="rounded-2xl border border-purple-100 bg-purple-50/70 px-4 py-3 text-xs font-bold text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-200">
            {loading ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 inline h-4 w-4" />}
            {sites.length ? 'Backend приема событий готов, сайтов: ' + sites.length : 'Создайте сайт и установите JS-скрипт на сайт'}
          </div>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {kpis.map(item => <MarketingKpiCard key={item.label} {...item} />)}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-max gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black transition',
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {renderTab()}
    </section>
  );
}
