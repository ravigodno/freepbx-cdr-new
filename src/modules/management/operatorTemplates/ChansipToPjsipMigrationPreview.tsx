import { useState } from 'react';
import { RotateCcw, Wand2 } from 'lucide-react';
import { Card, PrimaryButton, SecondaryButton, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { mapChansipToPjsip } from './chansipToPjsipMapper';
import { ChansipMigrationPreview } from './operatorTemplateTypes';

function PreviewBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const t = ui.management.operatorTemplatesModule.migration;
  const entries = Object.entries(data);
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h5 className="text-xs font-black text-slate-850 dark:text-white">{title}</h5>
      <div className="mt-3 space-y-2">
        {entries.length === 0 && <div className="text-xs font-semibold text-slate-400">{t.noData}</div>}
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 rounded bg-slate-50 px-2 py-1.5 text-[11px] dark:bg-slate-800/70">
            <span className="w-36 shrink-0 font-black text-slate-500">{key}</span>
            <span className="break-all font-mono text-slate-700 dark:text-slate-200">{Array.isArray(value) ? JSON.stringify(value) : String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  const t = ui.management.operatorTemplatesModule.migration;
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h5 className="text-xs font-black text-slate-850 dark:text-white">{title}</h5>
      <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {items.length === 0 && <li className="font-semibold text-slate-400">{t.noData}</li>}
        {items.map(item => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

export function ChansipToPjsipMigrationPreview() {
  const t = ui.management.operatorTemplatesModule.migration;
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<ChansipMigrationPreview | null>(null);

  const reset = () => {
    setInput('');
    setPreview(null);
  };

  const showPreview = () => setPreview(mapChansipToPjsip(input));

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-sm font-black text-slate-850 dark:text-white">{t.title}</h4>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t.description}</p>
          </div>
          {preview?.maskedSecretsDetected && <StatusBadge tone="warning">{t.secretsDetected}</StatusBadge>}
        </div>
        <label className="block">
          <span className="text-[10px] font-black uppercase text-slate-400">{t.inputLabel}</span>
          <textarea className="mt-2 min-h-[220px] w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" value={input} onChange={event => setInput(event.target.value)} placeholder={t.inputPlaceholder} />
        </label>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton onClick={showPreview}><Wand2 className="h-4 w-4" />{ui.buttons.showPreview}</PrimaryButton>
          <SecondaryButton onClick={reset}><RotateCcw className="h-4 w-4" />{ui.buttons.clear}</SecondaryButton>
        </div>
        {preview && (
          <div className="grid gap-3 xl:grid-cols-2">
            <PreviewBlock title={t.parsedFields} data={preview.parsedFields} />
            <PreviewBlock title={t.pjsipPreview} data={preview.pjsipPreview} />
            <ListBlock title={t.warnings} items={preview.warnings} />
            <ListBlock title={t.manualReview} items={preview.manualReviewFields} />
          </div>
        )}
      </div>
    </Card>
  );
}
