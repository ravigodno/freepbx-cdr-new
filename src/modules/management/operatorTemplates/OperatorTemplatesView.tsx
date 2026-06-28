import { useMemo, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { PageHeader, Section, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { ChansipToPjsipMigrationPreview } from './ChansipToPjsipMigrationPreview';
import { OperatorTemplateDetails } from './OperatorTemplateDetails';
import { OperatorTemplateFilters } from './OperatorTemplateFilters';
import { OperatorTemplateStats } from './OperatorTemplateStats';
import { OperatorTemplatesTable } from './OperatorTemplatesTable';
import { operatorTemplates } from './operatorTemplatesData';
import { getTechnologyType, OperatorTemplate, OperatorTemplateFiltersState } from './operatorTemplateTypes';

const initialFilters: OperatorTemplateFiltersState = {
  search: '',
  status: 'all',
  technology: 'all',
  region: 'all',
  country: 'all'
};

export function OperatorTemplatesView() {
  const t = ui.management.operatorTemplatesModule;
  const [filters, setFilters] = useState(initialFilters);
  const [selectedTemplate, setSelectedTemplate] = useState<OperatorTemplate | undefined>(operatorTemplates[0]);

  const filteredTemplates = useMemo(() => operatorTemplates.filter(template => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || template.operator.toLowerCase().includes(search) || template.name.toLowerCase().includes(search);
    const matchesStatus = filters.status === 'all' || template.status === filters.status;
    const matchesTechnology = filters.technology === 'all' || getTechnologyType(template.technology) === filters.technology;
    const matchesRegion = filters.region === 'all' || template.region === filters.region;
    const matchesCountry = filters.country === 'all' || template.country === filters.country;
    return matchesSearch && matchesStatus && matchesTechnology && matchesRegion && matchesCountry;
  }), [filters]);

  return (
    <Section>
      <PageHeader icon={GitBranch} title={t.title} description={t.description} actions={<StatusBadge tone="info">Git Templates</StatusBadge>} />
      <OperatorTemplateStats templates={operatorTemplates} />
      <OperatorTemplateFilters filters={filters} templates={operatorTemplates} onChange={setFilters} />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <OperatorTemplatesTable templates={filteredTemplates} selectedId={selectedTemplate?.id} onSelect={setSelectedTemplate} />
        <OperatorTemplateDetails template={selectedTemplate} />
      </div>
      <ChansipToPjsipMigrationPreview />
    </Section>
  );
}
