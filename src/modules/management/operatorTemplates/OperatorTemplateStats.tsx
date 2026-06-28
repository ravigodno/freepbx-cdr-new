import { OperationSummary } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { getTechnologyType, isTechnologyDeprecated, OperatorTemplate } from './operatorTemplateTypes';

export function OperatorTemplateStats({ templates }: { templates: OperatorTemplate[] }) {
  const t = ui.management.operatorTemplatesModule.stats;
  return (
    <OperationSummary
      items={[
        { key: 'total', label: t.total, value: templates.length, tone: 'info' },
        { key: 'verified', label: t.verified, value: templates.filter(item => item.status === 'verified').length, tone: 'success' },
        { key: 'tested', label: t.tested, value: templates.filter(item => item.status === 'tested').length, tone: 'success' },
        { key: 'draft', label: t.draft, value: templates.filter(item => item.status === 'draft').length, tone: 'neutral' },
        { key: 'pjsip', label: t.pjsip, value: templates.filter(item => getTechnologyType(item.technology) === 'pjsip').length, tone: 'info' },
        { key: 'chansip', label: t.chansip, value: templates.filter(item => getTechnologyType(item.technology) === 'chan_sip').length, tone: 'warning' },
        { key: 'deprecated', label: t.deprecated, value: templates.filter(item => isTechnologyDeprecated(item.technology) || item.status === 'deprecated').length, tone: 'warning' }
      ]}
    />
  );
}
