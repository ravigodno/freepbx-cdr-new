import { useEffect, useMemo, useState } from 'react';
import { Banknote, BarChart3, CheckCircle2, CircleDollarSign, Loader2, MousePointerClick, PhoneCall, PhoneMissed, Target, TrendingDown } from 'lucide-react';
import { MarketingFunnelChain } from './MarketingFunnelChain';
import { MarketingIntegrationsPanel } from './MarketingIntegrationsPanel';
import { MarketingAggregatesPanel } from './MarketingAggregatesPanel';
import { CalltrackingNumbersPanel } from './CalltrackingNumbersPanel';
import { MarketingKpiCard } from './MarketingKpiCard';
import { CampaignsReportTable, LostLeadsTable, MetrikaPagesTable, PhoneClicksTable, TrafficSourcesTable } from './MarketingTables';
import { MarketingEmptyState } from './MarketingEmptyState';
import { CalltrackingPhoneNumber, CalltrackingReplacementRule, CalltrackingSite, CalltrackingSummaryResponse, MarketingAggregatesResponse, MarketingOverviewSummary, PhoneClickEvent, TrafficSourceSummary, UsedCallQualitySettings, YandexDirectSourceRow, YandexDirectSummary, YandexMetrikaIntegration, YandexMetrikaPageSummary, YandexMetrikaPhoneGoalEventsResponse, YandexMetrikaPhoneGoalEventRow, YandexMetrikaPhoneGoalSummaryResponse, YandexMetrikaSourceSummary, YandexMetrikaSummary } from './types';

type MarketingTabId = 'overview' | 'phone-clicks' | 'sources' | 'campaigns' | 'pages' | 'utm' | 'lost-leads' | 'analytics' | 'integrations' | 'numbers';

const tabs: Array<{ id: MarketingTabId; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'phone-clicks', label: 'Клики по телефонам' },
  { id: 'sources', label: 'Источники' },
  { id: 'campaigns', label: 'Кампании' },
  { id: 'pages', label: 'Страницы' },
  { id: 'utm', label: 'UTM' },
  { id: 'lost-leads', label: 'Потерянные лиды' },
  { id: 'analytics', label: 'Сквозная аналитика' },
  { id: 'numbers', label: 'Номера и подмена' },
  { id: 'integrations', label: 'Интеграции' }
];

function getAuthToken(): string {
  const sessionSaved = localStorage.getItem('asterisk_cdr_session');
  if (!sessionSaved) return '';
  try { return JSON.parse(sessionSaved)?.token || ''; } catch { return ''; }
}

const DEFAULT_DIRECT_SUMMARY: YandexDirectSummary = {
  status: 'not_configured',
  lastError: null,
  summary: { cost: null, clicks: null, avgCpc: null, campaigns: 0, directVisits: null, warning: null },
  warning: null
};

const DEFAULT_METRIKA_GOAL_SUMMARY: YandexMetrikaPhoneGoalSummaryResponse = {
  items: [],
  totalGoalConversions: 0,
  partialErrors: []
};

function isFiniteNumber(value: unknown): value is number {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function numberOrNull(value: unknown): number | null {
  return isFiniteNumber(value) ? Number(value) : null;
}

function roundMoney(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return roundMoney(numerator / denominator);
}

function formatMetric(value: number | null | undefined, suffix = ''): string {
  if (!isFiniteNumber(value)) return '—';
  return Number(value).toLocaleString('ru-RU') + suffix;
}

function formatMoney(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return '—';
  return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function getInitialMarketingTab(): MarketingTabId {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get('marketingTab');
  if (requestedTab && tabs.some(tab => tab.id === requestedTab)) return requestedTab as MarketingTabId;
  if (params.get('yandexOAuth')) return 'integrations';
  return 'overview';
}

async function readJsonSafe(response: Response): Promise<any> {
  try { return await response.json(); } catch { return {}; }
}

function getDefaultMarketingRange() {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const start = new Date(today);
  start.setDate(start.getDate() - 30);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export default function MarketingTab() {
  const [activeTab, setActiveTab] = useState<MarketingTabId>(() => getInitialMarketingTab());
  const [summaryData, setSummaryData] = useState<CalltrackingSummaryResponse | null>(null);
  const [phoneClicks, setPhoneClicks] = useState<PhoneClickEvent[]>([]);
  const defaultRange = useMemo(() => getDefaultMarketingRange(), []);
  const [reportStartDate] = useState(defaultRange.startDate);
  const [reportEndDate] = useState(defaultRange.endDate);
  const [sources, setSources] = useState<TrafficSourceSummary[]>([]);
  const [aggregatesData, setAggregatesData] = useState<MarketingAggregatesResponse | null>(null);
  const [sites, setSites] = useState<CalltrackingSite[]>([]);
  const [calltrackingNumbers, setCalltrackingNumbers] = useState<CalltrackingPhoneNumber[]>([]);
  const [calltrackingRules, setCalltrackingRules] = useState<CalltrackingReplacementRule[]>([]);
  const [metrikaIntegrations, setMetrikaIntegrations] = useState<YandexMetrikaIntegration[]>([]);
  const [metrikaSummary, setMetrikaSummary] = useState<YandexMetrikaSummary | null>(null);
  const [metrikaSources, setMetrikaSources] = useState<YandexMetrikaSourceSummary[]>([]);
  const [metrikaPages, setMetrikaPages] = useState<YandexMetrikaPageSummary[]>([]);
  const [metrikaStatus, setMetrikaStatus] = useState<'connected' | 'not_configured' | 'error'>('not_configured');
  const [directSummary, setDirectSummary] = useState<YandexDirectSummary>(DEFAULT_DIRECT_SUMMARY);
  const [directSources, setDirectSources] = useState<YandexDirectSourceRow[]>([]);
  const [metrikaGoalSummary, setMetrikaGoalSummary] = useState<YandexMetrikaPhoneGoalSummaryResponse>(DEFAULT_METRIKA_GOAL_SUMMARY);
  const [metrikaGoalRows, setMetrikaGoalRows] = useState<YandexMetrikaPhoneGoalEventRow[]>([]);
  const [metrikaGoalWarning, setMetrikaGoalWarning] = useState<string | null>(null);
  const [usedSettings, setUsedSettings] = useState<UsedCallQualitySettings | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
        const startDate = reportStartDate;
        const endDate = reportEndDate;
        const [summaryRes, eventsRes, sourcesRes, aggregatesRes, sitesRes, numbersRes, rulesRes, metrikaIntegrationsRes, metrikaSummaryRes, metrikaSourcesRes, metrikaPagesRes, directSummaryRes, directSourcesRes, metrikaGoalSummaryRes, metrikaGoalEventsRes] = await Promise.all([
          fetch('/api/calltracking/summary?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/calltracking/matches?limit=100&startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/calltracking/sources?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/aggregates?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/calltracking/sites', { headers }),
          fetch('/api/calltracking/phone-numbers', { headers }),
          fetch('/api/calltracking/replacement-rules', { headers }),
          fetch('/api/marketing/metrika/integrations', { headers }),
          fetch('/api/marketing/metrika/summary?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/metrika/sources?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/metrika/pages?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/direct/summary?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/direct/sources?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/metrika/goals/summary?startDate=' + startDate + '&endDate=' + endDate, { headers }),
          fetch('/api/marketing/metrika/goals/events?startDate=' + startDate + '&endDate=' + endDate, { headers })
        ]);
        if (!summaryRes.ok || !eventsRes.ok || !sourcesRes.ok || !sitesRes.ok || !metrikaIntegrationsRes.ok || !metrikaSummaryRes.ok || !metrikaSourcesRes.ok || !metrikaPagesRes.ok) {
          throw new Error('Не удалось загрузить данные маркетинга.');
        }
        const [summaryJson, eventsJson, sourcesJson, aggregatesJson, sitesJson, numbersJson, rulesJson, metrikaIntegrationsJson, metrikaSummaryJson, metrikaSourcesJson, metrikaPagesJson, directSummaryJson, directSourcesJson, metrikaGoalSummaryJson, metrikaGoalEventsJson] = await Promise.all([
          readJsonSafe(summaryRes), readJsonSafe(eventsRes), readJsonSafe(sourcesRes), readJsonSafe(aggregatesRes), readJsonSafe(sitesRes), readJsonSafe(numbersRes), readJsonSafe(rulesRes), readJsonSafe(metrikaIntegrationsRes), readJsonSafe(metrikaSummaryRes), readJsonSafe(metrikaSourcesRes), readJsonSafe(metrikaPagesRes), readJsonSafe(directSummaryRes), readJsonSafe(directSourcesRes), readJsonSafe(metrikaGoalSummaryRes), readJsonSafe(metrikaGoalEventsRes)
        ]);
        if (!active) return;
        setSummaryData(summaryJson.summary || null);
        setPhoneClicks(asArray<PhoneClickEvent>(eventsJson.matches));
        setSources(asArray<TrafficSourceSummary>(sourcesJson.sources));
        setAggregatesData(aggregatesRes.ok ? (aggregatesJson as MarketingAggregatesResponse) : null);
        setSites(asArray<CalltrackingSite>(sitesJson.sites));
        setCalltrackingNumbers(numbersRes.ok ? asArray<CalltrackingPhoneNumber>(numbersJson.numbers) : []);
        setCalltrackingRules(rulesRes.ok ? asArray<CalltrackingReplacementRule>(rulesJson.rules) : []);
        setMetrikaIntegrations(asArray<YandexMetrikaIntegration>(metrikaIntegrationsJson.integrations).map(integration => {
          if (['connected', 'connected_limited', 'connected_no_data', 'disabled'].includes(String(directSummaryJson.status || '')) && integration.direct) {
            return { ...integration, direct: { ...integration.direct, lastError: null } };
          }
          return integration;
        }));
        setMetrikaSummary(metrikaSummaryJson.summary || null);
        setMetrikaSources(asArray<YandexMetrikaSourceSummary>(metrikaSourcesJson.sources));
        setMetrikaPages(asArray<YandexMetrikaPageSummary>(metrikaPagesJson.pages));
        setMetrikaStatus(metrikaSummaryJson.status || 'not_configured');
        setDirectSummary(directSummaryRes.ok && directSummaryJson?.summary ? {
          status: directSummaryJson.status || 'not_configured',
          lastError: directSummaryJson.lastError || null,
          summary: {
            cost: numberOrNull(directSummaryJson.summary.cost),
            clicks: numberOrNull(directSummaryJson.summary.clicks),
            avgCpc: numberOrNull(directSummaryJson.summary.avgCpc),
            campaigns: numberOrNull(directSummaryJson.summary.campaigns) || 0,
            noData: directSummaryJson.summary.noData === true || directSummaryJson.status === 'connected_no_data',
            directVisits: numberOrNull(directSummaryJson.summary.directVisits ?? directSummaryJson.summary.clicks),
            warning: directSummaryJson.summary.warning || directSummaryJson.warning || null
          },
          warning: directSummaryJson.warning || directSummaryJson.summary.warning || null
        } : { ...DEFAULT_DIRECT_SUMMARY, status: directSummaryRes.ok ? 'not_configured' : 'error', lastError: directSummaryJson?.error || directSummaryJson?.lastError || null });
        setDirectSources(directSourcesRes.ok ? asArray<YandexDirectSourceRow>(directSourcesJson.items) : []);
        setMetrikaGoalSummary(metrikaGoalSummaryRes.ok ? {
          items: asArray(metrikaGoalSummaryJson.items),
          totalGoalConversions: numberOrNull(metrikaGoalSummaryJson.totalGoalConversions) || 0,
          partialErrors: asArray(metrikaGoalSummaryJson.partialErrors)
        } : DEFAULT_METRIKA_GOAL_SUMMARY);
        const goalEventsResponse = metrikaGoalEventsJson as YandexMetrikaPhoneGoalEventsResponse;
        setMetrikaGoalRows(metrikaGoalEventsRes.ok ? asArray<YandexMetrikaPhoneGoalEventRow>(goalEventsResponse.rows) : []);
        setMetrikaGoalWarning((metrikaGoalSummaryRes.ok && metrikaGoalEventsRes.ok) ? null : (metrikaGoalSummaryJson?.error || metrikaGoalEventsJson?.error || 'Не удалось загрузить сверку целей Метрики.'));
        setUsedSettings(summaryJson.usedSettings || eventsJson.usedSettings || sourcesJson.usedSettings || null);
      } catch (err: any) {
        if (active) setError(err?.message || 'Не удалось загрузить данные коллтрекинга.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMarketing();
    return () => { active = false; };
  }, [refreshKey, reportEndDate, reportStartDate]);

  const callbackSlaHours = usedSettings?.missedCallCallbackSlaHours ?? 24;
  const aggregateRowsAvailable = Boolean(aggregatesData && Number(aggregatesData.total || 0) > 0);
  const aggregateSummary = aggregateRowsAvailable ? aggregatesData?.summary : null;
  const useMetrikaVisits = metrikaStatus === 'connected' && Number(metrikaSummary?.visits || 0) > 0;

  const mergedSources = useMemo(() => {
    if (aggregateRowsAvailable) return asArray<TrafficSourceSummary>(aggregatesData?.sources);

    const map = new Map<string, TrafficSourceSummary>();
    const keyOf = (source: string, medium?: string | null, campaign?: string | null) => [source || 'direct', medium || '', campaign || ''].join('||');
    asArray<TrafficSourceSummary>(sources).forEach(source => map.set(keyOf(source.source, source.medium, source.campaign), { ...source }));
    asArray<YandexMetrikaSourceSummary>(metrikaSources).forEach(source => {
      const key = keyOf(source.source, source.medium, source.campaign);
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, visits: source.visits || existing.visits, users: source.users, bounceRate: source.bounceRate, avgVisitDurationSeconds: source.avgVisitDurationSeconds });
      } else {
        map.set(key, { source: source.source, medium: source.medium || '', campaign: source.campaign || '', visits: source.visits || 0, users: source.users, bounceRate: source.bounceRate, avgVisitDurationSeconds: source.avgVisitDurationSeconds, phoneClicks: 0, formSubmits: 0, calls: 0, answeredCalls: 0, missedCalls: 0, recoveredByCallback: 0, trueLostLeads: 0, clickToCallConversion: 0, callbackRecoveryRate: 0, cost: null, costPerCall: null });
      }
    });
    asArray<YandexDirectSourceRow>(directSources).forEach(source => {
      const cost = numberOrNull(source.cost);
      const directClicks = numberOrNull(source.clicks);
      const campaign = source.campaignName || source.campaignId || '';
      const key = keyOf(source.source || 'yandex', source.medium || 'cpc', campaign);
      const existing = map.get(key) || {
        source: source.source || 'yandex',
        medium: source.medium || 'cpc',
        campaign,
        visits: 0,
        phoneClicks: 0,
        formSubmits: 0,
        calls: 0,
        answeredCalls: 0,
        missedCalls: 0,
        recoveredByCallback: 0,
        trueLostLeads: 0,
        clickToCallConversion: 0,
        callbackRecoveryRate: 0
      };
      const calls = numberOrNull(existing.calls) || 0;
      const answeredCalls = numberOrNull(existing.answeredCalls) || 0;
      const trueLostLeads = numberOrNull(existing.trueLostLeads ?? existing.lostCalls) || 0;
      map.set(key, {
        ...existing,
        cost,
        directClicks,
        avgCpc: cost === null ? null : safeDivide(cost, directClicks),
        costPerCall: cost === null ? null : safeDivide(cost, calls),
        costPerAnsweredCall: cost === null ? null : safeDivide(cost, answeredCalls),
        costPerLostLead: cost === null ? null : safeDivide(cost, trueLostLeads),
        lostBudgetEstimate: cost === null ? null : (trueLostLeads > 0 && calls > 0 ? roundMoney(cost * (trueLostLeads / calls)) : 0)
      });
    });
    return Array.from(map.values()).sort((a, b) => Number(b.phoneClicks || 0) - Number(a.phoneClicks || 0) || Number(b.visits || 0) - Number(a.visits || 0));
  }, [aggregateRowsAvailable, aggregatesData?.sources, directSources, metrikaSources, sources]);

  const isDirectConnected = directSummary.status === 'connected';
  const isDirectLimited = directSummary.status === 'connected_limited' || directSummary.status === 'connected_no_data';
  const directLimitedWarning = directSummary.warning || directSummary.summary.warning || (directSummary.status === 'connected_no_data' ? 'Директ подключен в ограниченном режиме. Метрика отдала 0 визитов Директа за выбранный период, сумма расходов через текущий API недоступна.' : 'Расходы недоступны, загружены визиты/кампании Директа');

  const summary: MarketingOverviewSummary = useMemo(() => ({
    visits: aggregateSummary ? Number(aggregateSummary.visits || 0) : (useMetrikaVisits ? Number(metrikaSummary?.visits || 0) : (summaryData ? Number(summaryData.uniqueSessions || summaryData.visits || 0) : null)),
    phoneClicks: aggregateSummary ? Number(aggregateSummary.phoneClicks || 0) : (summaryData ? Number(summaryData.phoneClicks || 0) : null),
    siteCalls: aggregateSummary ? Number(aggregateSummary.matchedCalls || 0) : (summaryData ? Number(summaryData.siteCalls ?? summaryData.matchedCalls ?? 0) : null),
    clickToCallConversion: aggregateSummary ? (Number(aggregateSummary.phoneClicks || 0) ? Math.round((Number(aggregateSummary.matchedCalls || 0) / Number(aggregateSummary.phoneClicks || 0)) * 1000) / 10 : 0) : (summaryData ? Number(summaryData.clickToCallConversion ?? 0) : null),
    missedSiteCalls: aggregateSummary ? Number(aggregateSummary.missedCalls || 0) : (summaryData ? Number(summaryData.missedSiteCalls ?? 0) : null),
    lostLeads: aggregateSummary ? Number(aggregateSummary.lostCalls || 0) : (summaryData ? Number(summaryData.trueLostLeads ?? summaryData.lostSiteCalls ?? 0) : null),
    adCost: aggregateSummary ? numberOrNull(aggregateSummary.adCost) : (directSummary.status === 'connected' ? directSummary.summary.cost : null),
    adClicks: aggregateSummary ? Number(aggregateSummary.adClicks || 0) : ((directSummary.status === 'connected' || directSummary.status === 'connected_limited' || directSummary.status === 'connected_no_data') ? (directSummary.summary.directVisits ?? directSummary.summary.clicks) : null),
    avgCpc: aggregateSummary ? safeDivide(numberOrNull(aggregateSummary.adCost), Number(aggregateSummary.adClicks || 0)) : (directSummary.status === 'connected' ? directSummary.summary.avgCpc : null),
    costPerCall: aggregateSummary ? numberOrNull(aggregateSummary.costPerCall) : safeDivide(directSummary.summary.cost, summaryData ? Number(summaryData.siteCalls ?? summaryData.matchedCalls ?? 0) : null),
    costPerAnsweredCall: aggregateSummary ? numberOrNull(aggregateSummary.costPerAnsweredCall) : safeDivide(directSummary.summary.cost, summaryData ? Number(summaryData.answeredSiteCalls ?? 0) : null),
    lostBudgetEstimate: aggregateSummary ? numberOrNull(aggregateSummary.lostBudgetEstimate) : (directSummary.summary.cost !== null && summaryData && Number(summaryData.trueLostLeads ?? summaryData.lostSiteCalls ?? 0) > 0 && Number(summaryData.siteCalls ?? summaryData.matchedCalls ?? 0) > 0
      ? roundMoney(Number(directSummary.summary.cost) * (Number(summaryData.trueLostLeads ?? summaryData.lostSiteCalls ?? 0) / Number(summaryData.siteCalls ?? summaryData.matchedCalls ?? 0)))
      : null)
  }), [aggregateSummary, directSummary, metrikaSummary?.visits, summaryData, useMetrikaVisits]);

  const kpis = useMemo(() => [
    { label: 'Визиты', value: formatMetric(summary.visits), hint: useMetrikaVisits ? 'Из Яндекс.Метрики' : (summaryData ? 'Fallback: события PBXPuls' : 'Данные появятся после подключения скрипта коллтрекинга'), icon: BarChart3, tone: 'blue' as const },
    { label: 'Клики по телефону', value: formatMetric(summary.phoneClicks), hint: summaryData ? 'Реальные события phone_click' : 'События сайта пока не собираются', icon: MousePointerClick, tone: 'purple' as const },
    { label: 'Звонки с сайта', value: formatMetric(summary.siteCalls), hint: summaryData ? 'Сопоставленные phone_click -> CDR' : 'Данные появятся после matching событий', icon: PhoneCall, tone: 'green' as const },
    { label: 'Конверсия клик → звонок', value: formatMetric(summary.clickToCallConversion, '%'), hint: 'Доля кликов, сопоставленных со звонками', icon: Target, tone: 'purple' as const },
    { label: 'Пропущенные звонки с сайта', value: formatMetric(summary.missedSiteCalls), hint: 'Сопоставленные звонки без успешного ответа', icon: PhoneMissed, tone: 'orange' as const },
    { label: 'Потерянные лиды', value: formatMetric(summary.lostLeads), hint: 'С учетом успешных перезвонов в течение ' + callbackSlaHours + ' ч', icon: TrendingDown, tone: 'red' as const },
    { label: 'Расходы', value: formatMoney(summary.adCost), hint: isDirectLimited ? directLimitedWarning : (isDirectConnected ? 'Расходы Яндекс Директа через Метрику' : 'Расходы Директа не подключены'), icon: CircleDollarSign, tone: 'blue' as const },
    { label: 'Клики', value: formatMetric(summary.adClicks), hint: isDirectLimited ? 'Визиты Директа из Метрики' : (isDirectConnected ? 'Клики Директа' : 'Расходы Директа не подключены'), icon: MousePointerClick, tone: 'purple' as const },
    { label: 'Средняя цена клика', value: formatMoney(summary.avgCpc), hint: isDirectLimited ? 'CPC недоступен без суммы расходов' : (isDirectConnected ? 'CPC по Direct costs' : 'Расходы Директа не подключены'), icon: Target, tone: 'blue' as const },
    { label: 'Цена звонка', value: formatMoney(summary.costPerCall), hint: 'Расход / звонки с сайта', icon: PhoneCall, tone: 'green' as const },
    { label: 'Цена отвеченного звонка', value: formatMoney(summary.costPerAnsweredCall), hint: 'Расход / отвеченные звонки', icon: CheckCircle2, tone: 'green' as const },
    { label: 'Потерянный бюджет', value: formatMoney(summary.lostBudgetEstimate), hint: isDirectLimited ? 'Недоступен без суммы расходов' : (isDirectConnected ? 'Оценка расхода на потерянные лиды' : 'Расходы Директа не подключены'), icon: Banknote, tone: 'red' as const }
  ], [summary, summaryData, callbackSlaHours, directSummary, useMetrikaVisits, isDirectConnected, isDirectLimited, directLimitedWarning]);

  const renderTab = () => {
    if (activeTab === 'phone-clicks') return <PhoneClicksTable events={phoneClicks} metrikaGoalSummary={metrikaGoalSummary} metrikaGoalRows={metrikaGoalRows} metrikaGoalError={metrikaGoalWarning} />;
    if (activeTab === 'sources') return <TrafficSourcesTable sources={mergedSources} />;
    if (activeTab === 'campaigns') return <CampaignsReportTable />;
    if (activeTab === 'lost-leads') return <LostLeadsTable events={phoneClicks.filter(event => event.leadStatus === 'lost')} />;
    if (activeTab === 'integrations') return <MarketingIntegrationsPanel sites={sites} metrikaIntegrations={metrikaIntegrations} loadingIntegrations={loading} integrationsError={error} onMetrikaChanged={() => setRefreshKey(value => value + 1)} />;
    if (activeTab === 'numbers') return <CalltrackingNumbersPanel sites={sites} numbers={calltrackingNumbers} rules={calltrackingRules} loading={loading} error={error} onChanged={() => setRefreshKey(value => value + 1)} />;
    if (activeTab === 'pages') {
      return <MetrikaPagesTable pages={metrikaPages} connected={metrikaStatus === 'connected'} />;
    }
    if (activeTab === 'utm') {
      return <MarketingEmptyState title="UTM-данные пока не собираются" description="PBXPuls начнет показывать utm_source, utm_medium и utm_campaign после подключения коллтрекинга." />;
    }
    if (activeTab === 'analytics') {
      return <MarketingAggregatesPanel startDate={reportStartDate} endDate={reportEndDate} status={aggregatesData?.status} sources={mergedSources} totalRows={Number(aggregatesData?.total || 0)} onRebuilt={() => setRefreshKey(value => value + 1)} />;
    }

    return (
      <div className="space-y-4">
        <MarketingFunnelChain />
        <div className="grid gap-4 xl:grid-cols-2">
          <PhoneClicksTable events={phoneClicks} metrikaGoalSummary={metrikaGoalSummary} metrikaGoalRows={metrikaGoalRows} metrikaGoalError={metrikaGoalWarning} />
          <TrafficSourcesTable sources={mergedSources} />
        </div>
        <MarketingIntegrationsPanel sites={sites} metrikaIntegrations={metrikaIntegrations} loadingIntegrations={loading} integrationsError={error} onMetrikaChanged={() => setRefreshKey(value => value + 1)} />
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
