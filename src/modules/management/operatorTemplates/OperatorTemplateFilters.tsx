import { ui } from '../../../locales/ru';
import { OperatorTemplate, OperatorTemplateFiltersState, OperatorTemplateStatus, OperatorTemplateTechnologyType } from './operatorTemplateTypes';

export function OperatorTemplateFilters({
  filters,
  templates,
  onChange
}: {
  filters: OperatorTemplateFiltersState;
  templates: OperatorTemplate[];
  onChange: (filters: OperatorTemplateFiltersState) => void;
}) {
  const t = ui.management.operatorTemplatesModule.filters;
  const statusLabels = ui.management.operatorTemplatesModule.statusLabels;
  const regions = Array.from(new Set(templates.map(item => item.region))).sort();
  const countries = Array.from(new Set(templates.map(item => item.country))).sort();
  const inputClass = 'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="grid gap-2 md:grid-cols-5">
      <input className={inputClass} value={filters.search} onChange={event => onChange({ ...filters, search: event.target.value })} placeholder={t.search} />
      <select className={inputClass} value={filters.status} onChange={event => onChange({ ...filters, status: event.target.value as 'all' | OperatorTemplateStatus })}>
        <option value="all">{t.all}</option>
        <option value="draft">{statusLabels.draft}</option>
        <option value="tested">{statusLabels.tested}</option>
        <option value="verified">{statusLabels.verified}</option>
        <option value="deprecated">{statusLabels.deprecated}</option>
      </select>
      <select className={inputClass} value={filters.technology} onChange={event => onChange({ ...filters, technology: event.target.value as 'all' | OperatorTemplateTechnologyType })}>
        <option value="all">{t.all}</option>
        <option value="pjsip">PJSIP</option>
        <option value="chan_sip">chan_sip</option>
      </select>
      <select className={inputClass} value={filters.region} onChange={event => onChange({ ...filters, region: event.target.value })}>
        <option value="all">{t.allRegions}</option>
        {regions.map(region => <option key={region} value={region}>{region}</option>)}
      </select>
      <select className={inputClass} value={filters.country} onChange={event => onChange({ ...filters, country: event.target.value })}>
        <option value="all">{t.allCountries}</option>
        {countries.map(country => <option key={country} value={country}>{country}</option>)}
      </select>
    </div>
  );
}
