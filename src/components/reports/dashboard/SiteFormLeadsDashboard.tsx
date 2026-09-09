import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, PhoneCall, Target, Users } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { StatsKpiCard } from './StatsKpiCard';

type BreakdownRow = {
  group_key: string | null;
  leads: number | string;
  attempted: number | string;
  contacted: number | string;
  completed: number | string;
  in_sla: number | string;
  avg_first_call_seconds?: number | string | null;
};

type ReportData = {
  overview: any;
  day: BreakdownRow[];
  source: BreakdownRow[];
  form: BreakdownRow[];
  site: BreakdownRow[];
  status: BreakdownRow[];
};

const emptyData: ReportData = { overview: null, day: [], source: [], form: [], site: [], status: [] };
const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#64748b'];
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const percent = (value: unknown) => `${Math.round(number(value))}%`;
const duration = (value: unknown) => {
  const seconds = Math.max(0, Math.round(number(value)));
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} мин ${seconds % 60} сек`;
};
const label = (value: unknown) => {
  const raw = String(value || 'Не указано');
  return raw.includes('|') ? raw.split('|')[0] || raw.split('|')[1] : raw;
};
const rows = (items: BreakdownRow[], limit = 10) => items.slice(0, limit).map(item => ({
  name: label(item.group_key),
  leads: number(item.leads),
  attempted: number(item.attempted),
  contacted: number(item.contacted),
  completed: number(item.completed),
  inSla: number(item.in_sla)
}));

function ChartCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <h3 className="text-base font-black text-slate-950 dark:text-white">{title}</h3>
    <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{hint}</p>
    <div className="mt-4 h-[320px] min-w-0">{children}</div>
  </section>;
}

export function SiteFormLeadsDashboard({ startDate, endDate, refreshKey = 0 }: { startDate: string; endDate: string; refreshKey?: number }) {
  const [data, setData] = useState<ReportData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const saved = localStorage.getItem('asterisk_cdr_session');
        let token = '';
        try { token = saved ? JSON.parse(saved)?.token || '' : ''; } catch {}
        const base = new URLSearchParams({ startDate, endDate });
        const get = async (path: string) => {
          const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || `Ошибка загрузки: ${response.status}`);
          return body;
        };
        const breakdown = (group: string) => get(`/api/site-forms/reports/breakdown?${base.toString()}&group=${group}`);
        const [overview, day, source, form, site, status] = await Promise.all([
          get(`/api/site-forms/reports/overview?${base.toString()}`),
          breakdown('day'), breakdown('source'), breakdown('form'), breakdown('site'), breakdown('status')
        ]);
        setData({
          overview,
          day: day.items || [],
          source: source.items || [],
          form: form.items || [],
          site: site.items || [],
          status: status.items || []
        });
      } catch (cause: any) {
        if (cause?.name !== 'AbortError') setError(cause?.message || 'Не удалось загрузить отчёт по заявкам');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [startDate, endDate, refreshKey]);

  const overview = data.overview || {};
  const summary = overview.summary || {};
  const conversion = overview.conversion || {};
  const funnel = overview.funnel || {};
  const dynamics = useMemo(() => rows([...data.day].reverse(), 500), [data.day]);
  const statuses = useMemo(() => rows(data.status, 12).filter(item => item.leads > 0), [data.status]);
  const funnelRows = [
    ['Получено', number(funnel.received)],
    ['В работе', number(funnel.inProgress)],
    ['Попытка звонка', number(funnel.attempted)],
    ['Успешный контакт', number(funnel.contacted)],
    ['Обработано', number(funnel.completed)]
  ].map(([name, value]) => ({ name, value }));
  const hasData = number(summary.total) > 0;

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300"><AlertTriangle className="mr-2 inline h-5 w-5" />{error}</div>;
  if (!loading && !hasData) return <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"><Target className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-3 font-black">За выбранный период заявок нет</h3><p className="mt-1 text-xs text-slate-500">Измените период или проверьте подключённые формы.</p></div>;

  return <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatsKpiCard label="Всего заявок" value={number(summary.total).toLocaleString('ru-RU')} hint="Без тестов, дублей и спама" icon={Target} tone="blue" loading={loading} />
      <StatsKpiCard label="Уникальные заявители" value={number(summary.unique_applicants).toLocaleString('ru-RU')} hint="По нормализованному телефону" icon={Users} tone="purple" loading={loading} />
      <StatsKpiCard label="Без звонка" value={number(summary.without_call).toLocaleString('ru-RU')} hint="Нет попытки связаться" icon={PhoneCall} tone={number(summary.without_call) ? 'orange' : 'green'} loading={loading} />
      <StatsKpiCard label="Успешный контакт" value={percent(conversion.contact)} hint="Есть отвеченный звонок" icon={CheckCircle2} tone="green" loading={loading} />
      <StatsKpiCard label="Просрочено SLA" value={number(summary.overdue).toLocaleString('ru-RU')} hint="Не позвонили в срок" icon={AlertTriangle} tone={number(summary.overdue) ? 'red' : 'green'} loading={loading} />
      <StatsKpiCard label="SLA заявок" value={percent(conversion.sla)} hint={`Первый звонок: ${duration(summary.avg_first_call_seconds)}`} icon={Clock3} tone="purple" loading={loading} />
      <StatsKpiCard label="Конверсия в звонок" value={percent(conversion.attempt)} hint="Есть попытка связаться" icon={PhoneCall} tone="blue" loading={loading} />
      <StatsKpiCard label="Обработано" value={percent(conversion.completed)} hint="Доля завершённых заявок" icon={CheckCircle2} tone="green" loading={loading} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Динамика заявок" hint="Получено, попытки связи, успешные контакты и обработка по дням">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={dynamics} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} />
          <XAxis dataKey="name" minTickGap={28} tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="leads" name="Заявки" stroke="#2563eb" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="attempted" name="Попытки" stroke="#f59e0b" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="contacted" name="Контакты" stroke="#10b981" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="completed" name="Обработано" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Воронка обработки" hint="Переход заявки от получения до завершения">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={funnelRows} layout="vertical" margin={{ left: 24, right: 24 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" horizontal={false} />
          <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11, fill: '#475569' }} />
          <Tooltip /><Bar dataKey="value" name="Заявки" fill="#2563eb" radius={[0, 8, 8, 0]} />
        </BarChart></ResponsiveContainer>
      </ChartCard>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <ChartCard title="Статусы заявок" hint="Текущее распределение по этапам обработки">
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statuses} dataKey="leads" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={3}>{statuses.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Источники" hint="Каналы, которые приводят заявки">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={rows(data.source, 8)} margin={{ left: -12 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={62} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="leads" name="Заявки" fill="#06b6d4" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Сайты" hint="Распределение заявок по интеграциям">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={rows(data.site, 8)} margin={{ left: -12 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" height={62} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="leads" name="Заявки" fill="#8b5cf6" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
    </div>

    <section className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-base font-black text-slate-950 dark:text-white">Детализация по источникам</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr><th className="py-2 pr-4">Источник</th><th className="px-3 py-2 text-right">Заявки</th><th className="px-3 py-2 text-right">Попытки</th><th className="px-3 py-2 text-right">Контакты</th><th className="px-3 py-2 text-right">В SLA</th></tr>
          </thead>
          <tbody>
            {data.source.map(item => <tr key={item.group_key ?? ''} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-3 pr-4">{label(item.group_key)}</td>
              <td className="px-3 py-3 text-right">{number(item.leads).toLocaleString('ru-RU')}</td>
              <td className="px-3 py-3 text-right">{number(item.attempted).toLocaleString('ru-RU')}</td>
              <td className="px-3 py-3 text-right">{number(item.contacted).toLocaleString('ru-RU')}</td>
              <td className="px-3 py-3 text-right">{number(item.in_sla).toLocaleString('ru-RU')}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <ChartCard title="Формы" hint="Какие формы дают больше заявок и успешных контактов">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={rows(data.form, 12)} margin={{ left: -12 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 7" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-18} textAnchor="end" height={68} /><YAxis allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="leads" name="Заявки" fill="#2563eb" radius={[6, 6, 0, 0]} /><Bar dataKey="contacted" name="Контакты" fill="#10b981" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
    </ChartCard>
  </div>;
}
