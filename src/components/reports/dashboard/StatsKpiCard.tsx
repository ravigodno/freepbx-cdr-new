import { LucideIcon } from 'lucide-react';

export type KpiTone = 'blue' | 'green' | 'orange' | 'red' | 'purple';

const toneClasses: Record<KpiTone, { icon: string; badge: string; ring: string }> = {
  blue: {
    icon: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300',
    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
    ring: 'group-hover:border-blue-200'
  },
  green: {
    icon: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    ring: 'group-hover:border-emerald-200'
  },
  orange: {
    icon: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    ring: 'group-hover:border-amber-200'
  },
  red: {
    icon: 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300',
    ring: 'group-hover:border-rose-200'
  },
  purple: {
    icon: 'border-violet-100 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300',
    badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300',
    ring: 'group-hover:border-violet-200'
  }
};

export function StatsKpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  badge
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone: KpiTone;
  badge?: string;
}) {
  const classes = toneClasses[tone];

  return (
    <div className={['group flex min-h-[132px] flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900', classes.ring].join(' ')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 truncate font-mono text-[28px] font-black leading-none text-slate-950 dark:text-white">{value}</div>
        </div>
        <div className={['flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', classes.icon].join(' ')}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        {hint && <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</div>}
        {badge && <div className={['shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase', classes.badge].join(' ')}>{badge}</div>}
      </div>
    </div>
  );
}
