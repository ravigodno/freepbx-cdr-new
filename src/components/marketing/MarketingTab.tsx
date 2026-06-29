import { useMemo, useState } from 'react';
import { Banknote, BarChart3, CheckCircle2, CircleDollarSign, MousePointerClick, PhoneCall, PhoneMissed, Target, TrendingDown } from 'lucide-react';
import { MarketingFunnelChain } from './MarketingFunnelChain';
import { MarketingIntegrationsPanel } from './MarketingIntegrationsPanel';
import { MarketingKpiCard } from './MarketingKpiCard';
import { CampaignsReportTable, LostLeadsTable, PhoneClicksTable, TrafficSourcesTable } from './MarketingTables';
import { MarketingEmptyState } from './MarketingEmptyState';
import { MarketingOverviewSummary } from './types';

type MarketingTabId = 'overview' | 'phone-clicks' | 'sources' | 'campaigns' | 'pages' | 'utm' | 'lost-leads' | 'analytics' | 'integrations';

const emptySummary: MarketingOverviewSummary = {
  visits: null,
  phoneClicks: null,
  siteCalls: null,
  clickToCallConversion: null,
  missedSiteCalls: null,
  lostLeads: null,
  adCost: null,
  lostBudgetEstimate: null
};

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

function formatMetric(value: number | null, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU') + suffix;
}

export default function MarketingTab() {
  const [activeTab, setActiveTab] = useState<MarketingTabId>('overview');
  const summary = emptySummary;

  const kpis = useMemo(() => [
    { label: 'Визиты', value: formatMetric(summary.visits), hint: 'Данные появятся после подключения скрипта коллтрекинга', icon: BarChart3, tone: 'blue' as const },
    { label: 'Клики по телефону', value: formatMetric(summary.phoneClicks), hint: 'События сайта пока не собираются', icon: MousePointerClick, tone: 'purple' as const },
    { label: 'Звонки с сайта', value: formatMetric(summary.siteCalls), hint: 'Связка phone_click -> CDR будет добавлена позже', icon: PhoneCall, tone: 'green' as const },
    { label: 'Конверсия клик → звонок', value: formatMetric(summary.clickToCallConversion, '%'), hint: 'Расчет появится после matching событий', icon: Target, tone: 'purple' as const },
    { label: 'Пропущенные звонки с сайта', value: formatMetric(summary.missedSiteCalls), hint: 'Пока нет привязки к источникам сайта', icon: PhoneMissed, tone: 'orange' as const },
    { label: 'Потерянные лиды', value: formatMetric(summary.lostLeads), hint: 'Будет считаться по пропускам без перезвона', icon: TrendingDown, tone: 'red' as const },
    { label: 'Рекламный расход', value: formatMetric(summary.adCost, ' ₽'), hint: 'Интеграция с рекламными кабинетами позже', icon: CircleDollarSign, tone: 'blue' as const },
    { label: 'Потерянный бюджет', value: formatMetric(summary.lostBudgetEstimate, ' ₽'), hint: 'Оценка появится после импорта расходов', icon: Banknote, tone: 'red' as const }
  ], [summary]);

  const renderTab = () => {
    if (activeTab === 'phone-clicks') return <PhoneClicksTable />;
    if (activeTab === 'sources') return <TrafficSourcesTable />;
    if (activeTab === 'campaigns') return <CampaignsReportTable />;
    if (activeTab === 'lost-leads') return <LostLeadsTable />;
    if (activeTab === 'integrations') return <MarketingIntegrationsPanel />;
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
          <PhoneClicksTable />
          <TrafficSourcesTable />
        </div>
        <MarketingIntegrationsPanel />
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
            <CheckCircle2 className="mr-2 inline h-4 w-4" />Каркас модуля: реальные интеграции будут добавлены позже
          </div>
        </div>
      </div>

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
