import { Eye, FileJson, StickyNote } from 'lucide-react';
import { IconButton, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { getTechnologyType, OperatorTemplate, OperatorTemplateStatus } from './operatorTemplateTypes';

const statusTone = (status: OperatorTemplateStatus) => status === 'verified' ? 'success' : status === 'tested' ? 'success' : status === 'deprecated' ? 'warning' : 'neutral';

export function OperatorTemplatesTable({
  templates,
  selectedId,
  onSelect
}: {
  templates: OperatorTemplate[];
  selectedId?: string;
  onSelect: (template: OperatorTemplate) => void;
}) {
  const t = ui.management.operatorTemplatesModule;
  const valueOrFallback = (items: string[]) => items.length ? items.join(', ') : t.table.notTested;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
      <table className="w-full min-w-[960px] text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-400 dark:bg-slate-800">
          <tr>
            <th className="p-3">{t.table.operator}</th>
            <th className="p-3">{t.table.template}</th>
            <th className="p-3">{t.table.region}</th>
            <th className="p-3">{t.table.technology}</th>
            <th className="p-3">{t.table.status}</th>
            <th className="p-3">{t.table.freepbx}</th>
            <th className="p-3">{t.table.asterisk}</th>
            <th className="p-3 text-right">{t.table.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {templates.map(template => {
            const technology = getTechnologyType(template.technology);
            return (
              <tr key={template.id} onClick={() => onSelect(template)} className={['cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60', selectedId === template.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''].join(' ')}>
                <td className="p-3 font-black text-slate-850 dark:text-white">{template.operator}</td>
                <td className="p-3 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">{template.name}</td>
                <td className="p-3 text-slate-500">{template.region}</td>
                <td className="p-3"><StatusBadge tone={technology === 'pjsip' ? 'info' : 'warning'}>{technology}</StatusBadge></td>
                <td className="p-3"><StatusBadge tone={statusTone(template.status)}>{t.statusLabels[template.status]}</StatusBadge></td>
                <td className="p-3 text-slate-500">{valueOrFallback(template.testedWith.freepbx)}</td>
                <td className="p-3 text-slate-500">{valueOrFallback(template.testedWith.asterisk)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <IconButton title={ui.buttons.view} onClick={event => { event.stopPropagation(); onSelect(template); }}><Eye className="h-4 w-4" /></IconButton>
                    <IconButton title={`${ui.buttons.json}: ${template.jsonPath}`} onClick={event => { event.stopPropagation(); onSelect(template); }}><FileJson className="h-4 w-4" /></IconButton>
                    <IconButton title={`${ui.buttons.notes}: ${template.notesPath}`} onClick={event => { event.stopPropagation(); onSelect(template); }}><StickyNote className="h-4 w-4" /></IconButton>
                  </div>
                </td>
              </tr>
            );
          })}
          {templates.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-xs font-semibold text-slate-400">{t.migration.noData}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
