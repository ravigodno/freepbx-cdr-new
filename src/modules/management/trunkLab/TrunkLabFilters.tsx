import { ui } from '../../../locales/ru';
import { TrunkLabFiltersState, TrunkLabRegistrationStatus, TrunkLabRiskLevel } from './trunkLabTypes';

export function TrunkLabFilters({ filters, onChange }: { filters: TrunkLabFiltersState; onChange: (filters: TrunkLabFiltersState) => void }) {
  const t = ui.management.trunkLab.filters;
  const inputClass = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="grid gap-2 md:grid-cols-4">
      <input className={inputClass} value={filters.search} onChange={event => onChange({ ...filters, search: event.target.value })} placeholder={t.search} />
      <select className={inputClass} value={filters.technology} onChange={event => onChange({ ...filters, technology: event.target.value as TrunkLabFiltersState['technology'] })}>
        <option value="all">{t.all}</option>
        <option value="pjsip">PJSIP</option>
        <option value="chan_sip">chan_sip</option>
      </select>
      <select className={inputClass} value={filters.risk} onChange={event => onChange({ ...filters, risk: event.target.value as 'all' | TrunkLabRiskLevel })}>
        <option value="all">{t.all}</option>
        <option value="ok">ok</option>
        <option value="warning">warning</option>
        <option value="critical">critical</option>
        <option value="unknown">unknown</option>
      </select>
      <select className={inputClass} value={filters.registration} onChange={event => onChange({ ...filters, registration: event.target.value as 'all' | TrunkLabRegistrationStatus })}>
        <option value="all">{t.all}</option>
        <option value="registered">registered</option>
        <option value="rejected">rejected</option>
        <option value="auth_failed">auth_failed</option>
        <option value="timeout">timeout</option>
        <option value="unknown">unknown</option>
      </select>
    </div>
  );
}
