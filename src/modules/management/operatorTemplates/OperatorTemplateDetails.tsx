import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { getTechnologyType, isTechnologyDeprecated, OperatorTemplate } from './operatorTemplateTypes';

function FieldList({ value }: { value: Record<string, unknown> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {Object.entries(value).map(([key, item]) => (
        <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/60">
          <div className="text-[10px] font-black uppercase text-slate-400">{key}</div>
          <div className="mt-1 break-words font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">{Array.isArray(item) ? item.join(', ') : String(item)}</div>
        </div>
      ))}
    </div>
  );
}

function TextList({ items }: { items: string[] }) {
  return <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">{items.map(item => <li key={item}>• {item}</li>)}</ul>;
}

export function OperatorTemplateDetails({ template }: { template?: OperatorTemplate }) {
  const t = ui.management.operatorTemplatesModule;

  if (!template) {
    return <Card className="p-4 text-xs font-semibold text-slate-400">{t.details.empty}</Card>;
  }

  const technology = getTechnologyType(template.technology);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-850 dark:text-white">{t.details.title}</h4>
            <p className="mt-1 font-mono text-[11px] text-slate-500">{template.id}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge tone={technology === 'pjsip' ? 'info' : 'warning'}>{technology}</StatusBadge>
            <StatusBadge tone={template.status === 'draft' ? 'neutral' : 'success'}>{t.statusLabels[template.status]}</StatusBadge>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
          <ShieldCheck className="mr-2 inline h-4 w-4" />{t.gitWarning}
        </div>
        {isTechnologyDeprecated(template.technology) && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />{t.chansipWarning}
          </div>
        )}

        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.main}</h5>
          <FieldList value={{ operator: template.operator, name: template.name, region: template.region, country: template.country, [t.details.jsonPath]: template.jsonPath, [t.details.notesPath]: template.notesPath }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.testedWith}</h5>
          <FieldList value={{ FreePBX: template.testedWith.freepbx.join(', ') || t.table.notTested, Asterisk: template.testedWith.asterisk.join(', ') || t.table.notTested, notes: template.testedWith.notes || t.table.notTested }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.settings}</h5>
          <FieldList value={template.fields} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.requiredUserFields}</h5>
          <TextList items={template.requiredUserFields} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.numberFormats}</h5>
          <FieldList value={template.numberFormats} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.diagnostics}</h5>
          <TextList items={[...template.diagnostics.hints, ...template.diagnostics.commonErrors]} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.notes}</h5>
          <TextList items={template.notes} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.security}</h5>
          <FieldList value={template.security} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.details.migration}</h5>
          <FieldList value={template.migration || {}} />
        </section>
      </div>
    </Card>
  );
}
