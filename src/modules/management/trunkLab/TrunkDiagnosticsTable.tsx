import { Eye } from 'lucide-react';
import { IconButton } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnostic } from './trunkLabTypes';
import { TrunkRegistrationBadge, TrunkRiskBadge, TrunkTechnologyBadge } from './TrunkDiagnosticBadges';

export function TrunkDiagnosticsTable({
  diagnostics,
  selectedId,
  onSelect
}: {
  diagnostics: TrunkDiagnostic[];
  selectedId?: string;
  onSelect: (diagnostic: TrunkDiagnostic) => void;
}) {
  const t = ui.management.trunkLab.table;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-400 dark:bg-slate-800">
          <tr>
            <th className="p-3">{t.trunk}</th>
            <th className="p-3">{t.technology}</th>
            <th className="p-3">{t.registration}</th>
            <th className="p-3">{t.endpoint}</th>
            <th className="p-3">{t.contact}</th>
            <th className="p-3">{t.risk}</th>
            <th className="p-3">{t.summary}</th>
            <th className="p-3 text-right">{t.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {diagnostics.map(item => (
            <tr key={item.id} onClick={() => onSelect(item)} className={['cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60', selectedId === item.id ? 'bg-blue-50/70 dark:bg-blue-950/20' : ''].join(' ')}>
              <td className="p-3 font-mono font-black text-slate-850 dark:text-white">{item.name}</td>
              <td className="p-3"><TrunkTechnologyBadge technology={item.technology} /></td>
              <td className="p-3"><TrunkRegistrationBadge status={item.registrationStatus} /></td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{item.endpointStatus}</td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{item.contactStatus}</td>
              <td className="p-3"><TrunkRiskBadge risk={item.riskLevel} /></td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{item.summary}</td>
              <td className="p-3">
                <div className="flex justify-end">
                  <IconButton title={ui.buttons.view} onClick={event => { event.stopPropagation(); onSelect(item); }}><Eye className="h-4 w-4" /></IconButton>
                </div>
              </td>
            </tr>
          ))}
          {diagnostics.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-xs font-semibold text-slate-400">{ui.management.trunkLab.empty.noTrunks}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
