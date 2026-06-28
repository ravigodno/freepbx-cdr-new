import React from 'react';
import { Building2, FileText, GitBranch, Plus, Route, UserPlus, Users, Wifi } from 'lucide-react';
import { Card, InfoCard, PageHeader, PrimaryButton, SecondaryButton, StatusBadge, Toolbar } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { MANAGEMENT_SECTIONS, ManagementSectionId } from './provisioningSections';

type ObjectMetric = { key: string; label: string; value: React.ReactNode; status: 'ready' | 'coming-soon' | 'not-implemented'; icon: any };

const statusLabel = (status: ObjectMetric['status']) => status === 'ready' ? ui.status.ready : status === 'coming-soon' ? ui.status.comingSoon : ui.status.notImplemented;

export function ProvisioningOverview({
  extensionsCount,
  operatorTemplatesCount,
  extensionTemplatesCount,
  onNavigate
}: {
  extensionsCount: number;
  operatorTemplatesCount: number;
  extensionTemplatesCount: number;
  onNavigate: (section: ManagementSectionId) => void;
}) {
  const metrics: ObjectMetric[] = [
    { key: 'extensions', label: ui.management.metrics.extensions, value: extensionsCount, status: 'ready', icon: UserPlus },
    { key: 'trunks', label: ui.management.metrics.trunks, value: ui.status.comingSoon, status: 'coming-soon', icon: Wifi },
    { key: 'outbound-routes', label: ui.management.metrics.outboundRoutes, value: ui.status.comingSoon, status: 'coming-soon', icon: Route },
    { key: 'inbound-routes', label: ui.management.metrics.inboundRoutes, value: ui.status.comingSoon, status: 'coming-soon', icon: GitBranch },
    { key: 'departments', label: ui.management.metrics.departments, value: ui.status.notImplemented, status: 'not-implemented', icon: Building2 },
    { key: 'templates', label: ui.management.metrics.templates, value: operatorTemplatesCount + extensionTemplatesCount, status: 'ready', icon: FileText }
  ];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <PageHeader
          icon={Users}
          title={ui.management.overviewTitle}
          description={ui.management.overviewDescription}
          actions={<StatusBadge tone="info">{ui.management.foundationBadge}</StatusBadge>}
        />
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map(metric => {
          const Icon = metric.icon;
          const tone = metric.status === 'ready' ? 'success' : metric.status === 'coming-soon' ? 'warning' : 'neutral';
          return (
            <Card key={metric.key} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-500 dark:text-slate-400"><Icon className="h-4 w-4 text-blue-600" />{metric.label}</div>
                  <div className="mt-2 text-2xl font-black text-slate-850 dark:text-white">{metric.value}</div>
                </div>
                <StatusBadge tone={tone as any}>{statusLabel(metric.status)}</StatusBadge>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <PageHeader icon={Plus} title={ui.management.quickActions} description={ui.management.quickActionsDescription} />
        <Toolbar className="mt-4">
          <PrimaryButton onClick={() => onNavigate('extensions')}><UserPlus className="h-4 w-4" />{ui.buttons.createExtension}</PrimaryButton>
          <SecondaryButton onClick={() => onNavigate('trunks')}><Wifi className="h-4 w-4" />{ui.buttons.createTrunk}</SecondaryButton>
          <SecondaryButton onClick={() => onNavigate('outbound-routes')}><Route className="h-4 w-4" />{ui.buttons.createRoute}</SecondaryButton>
          <SecondaryButton onClick={() => onNavigate('departments')}><Building2 className="h-4 w-4" />{ui.buttons.createDepartment}</SecondaryButton>
        </Toolbar>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <InfoCard label={ui.management.operationFramework} value="Preview → Apply → Result" tone="info" />
        <InfoCard label={ui.management.designSystem} value={ui.management.sharedUi} tone="success" />
        <InfoCard label={ui.management.nextModule} value={ui.management.trunks} tone="warning" />
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {MANAGEMENT_SECTIONS.filter(section => section.id !== 'overview').map(section => {
            const Icon = section.icon;
            return (
              <button key={section.id} type="button" onClick={() => onNavigate(section.id)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:border-slate-700 dark:hover:border-blue-900 dark:hover:bg-blue-950/20">
                <div className="flex items-center gap-2 text-xs font-black text-slate-850 dark:text-white"><Icon className="h-4 w-4 text-blue-600" />{section.label}</div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{section.description}</p>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
