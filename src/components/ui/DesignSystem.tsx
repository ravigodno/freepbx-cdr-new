import React from 'react';
import { Check, Eye, RefreshCw, Undo } from 'lucide-react';

export type ButtonTone = 'primary' | 'secondary' | 'danger';
export type StatusTone = 'success' | 'warning' | 'error' | 'neutral' | 'info';

const buttonBase = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-60';
const iconButtonBase = 'inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-60';

const buttonToneClasses: Record<ButtonTone, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700'
};

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={[buttonBase, buttonToneClasses.primary, className].join(' ')}>{children}</button>;
}

export function SecondaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={[buttonBase, buttonToneClasses.secondary, className].join(' ')}>{children}</button>;
}

export function DangerButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={[buttonBase, buttonToneClasses.danger, className].join(' ')}>{children}</button>;
}

export function IconButton({ tone = 'secondary', className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return <button type="button" {...props} className={[iconButtonBase, buttonToneClasses[tone], className].join(' ')}>{children}</button>;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={['rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900', className].join(' ')}>{children}</div>;
}

export function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={['space-y-4', className].join(' ')}>{children}</section>;
}

export function Toolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={['flex flex-wrap items-center gap-2', className].join(' ')}>{children}</div>;
}

export function PageHeader({ icon: Icon, title, description, actions }: { icon?: React.ElementType; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-850 dark:text-white">
          {Icon && <Icon className="h-5 w-5 text-blue-600" />}
          {title}
        </h3>
        {description && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function InfoCard({ label, value, tone = 'neutral' }: { label: string; value: React.ReactNode; tone?: StatusTone }) {
  const valueClass = tone === 'success' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'warning' ? 'text-amber-600 dark:text-amber-300' : tone === 'error' ? 'text-rose-600 dark:text-rose-300' : tone === 'info' ? 'text-blue-600 dark:text-blue-300' : 'text-slate-850 dark:text-white';
  return <div className="rounded-lg border border-slate-150 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/60"><span className="font-black uppercase text-slate-400">{label}</span><div className={['mt-1 font-mono text-lg font-black', valueClass].join(' ')}>{value}</div></div>;
}

export function StatusBadge({ tone = 'neutral', children, className = '' }: { tone?: StatusTone; children: React.ReactNode; className?: string }) {
  const tones: Record<StatusTone, string> = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/40',
    warning: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
    error: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40',
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    info: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900/40'
  };
  return <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ring-1', tones[tone], className].join(' ')}>{children}</span>;
}

export function OperationToolbar({ onPreview, onApply, onReset, previewDisabled, applyDisabled, previewLoading, applyLoading }: { onPreview: () => void; onApply: () => void; onReset: () => void; previewDisabled?: boolean; applyDisabled?: boolean; previewLoading?: boolean; applyLoading?: boolean }) {
  return (
    <Toolbar>
      <PrimaryButton onClick={onPreview} disabled={previewDisabled || previewLoading}>{previewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Preview</PrimaryButton>
      <PrimaryButton onClick={onApply} disabled={applyDisabled || applyLoading}>{applyLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Apply</PrimaryButton>
      <SecondaryButton onClick={onReset}><Undo className="h-4 w-4" />Reset</SecondaryButton>
    </Toolbar>
  );
}

export function OperationSummary({ items }: { items: Array<{ key: string; label: string; value: number; tone?: StatusTone }> }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">{items.map(item => <div key={item.key} className="min-h-[86px] rounded-lg border border-slate-150 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><StatusBadge tone={item.tone || 'neutral'}>{item.label}</StatusBadge><div className="mt-2 text-2xl font-black text-slate-850 dark:text-white">{item.value}</div></div>)}</div>;
}

export type PreviewTableItem = { object: string; action: string; status: string; oldValue: any; newValue: any; message: string; diff?: any[] };

export function PreviewTable({ items, actionClass, summarizeValue, formatDiffValue }: { items: PreviewTableItem[]; actionClass: (action: string) => string; summarizeValue: (value: any) => string; formatDiffValue: (value: any) => string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
      <table className="w-full min-w-[920px] text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 dark:bg-slate-800">
          <tr><th className="p-3">Object</th><th className="p-3">Action</th><th className="p-3">Status</th><th className="p-3">Old</th><th className="p-3">New</th><th className="p-3">Message</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, idx) => (
            <tr key={(item.object || 'row') + '-' + idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
              <td className="p-3 font-mono font-black text-slate-850 dark:text-white">{item.object || '-'}</td>
              <td className="p-3"><span className={'rounded-full px-2 py-1 text-[10px] font-black uppercase ' + actionClass(item.action)}>{item.action || '-'}</span></td>
              <td className="p-3"><span className={'rounded-full px-2 py-1 text-[10px] font-black uppercase ' + actionClass(String(item.status).toLowerCase())}>{item.status}</span></td>
              <td className="p-3 font-mono text-[10px] text-slate-500">{summarizeValue(item.oldValue)}</td>
              <td className="p-3"><div className="font-mono text-[10px] text-slate-500">{summarizeValue(item.newValue)}{Array.isArray(item.diff) && item.diff.length > 0 && <div className="mt-2 space-y-1">{item.diff.map((diff: any) => <div key={diff.field} className="rounded bg-slate-50 px-2 py-1 dark:bg-slate-800"><span className="font-black text-slate-700 dark:text-slate-200">{diff.field}</span>: {formatDiffValue(diff.before)} -&gt; {formatDiffValue(diff.after)}</div>)}</div>}</div></td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{item.message || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
