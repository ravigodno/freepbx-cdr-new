import { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: 'blue' | 'purple' | 'green' | 'orange' | 'red';
}

const toneClasses: Record<Props['tone'], string> = {
  blue: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/40',
  purple: 'bg-purple-50 text-purple-600 ring-purple-100 dark:bg-purple-950/30 dark:text-purple-300 dark:ring-purple-900/40',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/40',
  orange: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
  red: 'bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40'
};

export function MarketingKpiCard({ label, value, hint, icon: Icon, tone }: Props) {
  return (
    <div className="min-h-[128px] rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
        </div>
        <div className={['flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ring-1', toneClasses[tone]].join(' ')}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  );
}
