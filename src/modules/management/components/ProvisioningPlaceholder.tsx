import React from 'react';
import { Hammer, ListChecks } from 'lucide-react';
import { Card, OperationSummary, PageHeader, PreviewTable, StatusBadge, Toolbar, SecondaryButton } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { ManagementSection } from './provisioningSections';

const actionClass = (action: string) => {
  const normalized = String(action || '').toLowerCase();
  if (normalized.includes('error')) return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300';
  if (normalized.includes('warning') || normalized.includes('planned')) return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
};

export function ProvisioningPlaceholder({ section }: { section: ManagementSection }) {
  const Icon = section.icon;
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageHeader
          icon={Icon}
          title={section.label}
          description={section.description}
          actions={<StatusBadge tone={section.status === 'foundation' ? 'info' : 'warning'}>{section.status === 'foundation' ? ui.status.foundation : ui.status.comingSoon}</StatusBadge>}
        />
      </Card>

      <Card className="p-5">
        <PageHeader icon={Hammer} title={ui.management.modulePlaceholder} description={ui.management.modulePlaceholderDescription} />
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300">
          {ui.management.moduleRoadmapPrefix} <span className="font-black text-slate-700 dark:text-slate-100">{section.roadmap}</span>.
        </div>
      </Card>

      <OperationSummary items={[
        { key: 'create', label: ui.operations.create, value: 0, tone: 'neutral' },
        { key: 'update', label: ui.operations.update, value: 0, tone: 'neutral' },
        { key: 'delete', label: ui.operations.delete, value: 0, tone: 'neutral' },
        { key: 'skip', label: ui.operations.skip, value: 0, tone: 'neutral' },
        { key: 'conflict', label: ui.operations.conflict, value: 0, tone: 'neutral' },
        { key: 'error', label: ui.operations.error, value: 0, tone: 'neutral' }
      ]} />

      <Card className="p-5">
        <PageHeader icon={ListChecks} title={ui.operations.preview} description={ui.management.previewDescription} />
        <div className="mt-4">
          <PreviewTable
            items={[{ object: section.label, action: ui.status.planned, status: 'SKIP', oldValue: null, newValue: null, message: ui.management.backendNotImplemented }]}
            actionClass={actionClass}
            summarizeValue={() => '-'}
            formatDiffValue={(value) => value === undefined || value === null || value === '' ? '-' : String(value)}
          />
        </div>
        <Toolbar className="mt-4"><SecondaryButton disabled>{ui.buttons.preview}</SecondaryButton><SecondaryButton disabled>{ui.buttons.apply}</SecondaryButton><SecondaryButton disabled>{ui.buttons.reset}</SecondaryButton></Toolbar>
      </Card>
    </div>
  );
}
