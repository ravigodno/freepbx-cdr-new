import { OperationSummary } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnostic } from './trunkLabTypes';

export function TrunkLabSummaryCards({ diagnostics }: { diagnostics: TrunkDiagnostic[] }) {
  const t = ui.management.trunkLab.summary;
  return (
    <OperationSummary
      items={[
        { key: 'total', label: t.total, value: diagnostics.length, tone: 'info' },
        { key: 'registered', label: t.registered, value: diagnostics.filter(item => item.registrationStatus === 'registered').length, tone: 'success' },
        { key: 'problems', label: t.problems, value: diagnostics.filter(item => item.riskLevel === 'warning' || item.riskLevel === 'critical').length, tone: 'warning' },
        { key: 'pjsip', label: t.pjsip, value: diagnostics.filter(item => item.technology === 'pjsip').length, tone: 'info' },
        { key: 'chansip', label: t.chansip, value: diagnostics.filter(item => item.technology === 'chan_sip').length, tone: 'warning' },
        { key: 'unreachable', label: t.unreachable, value: diagnostics.filter(item => item.endpointStatus === 'unreachable' || item.contactStatus === 'unreachable').length, tone: 'error' },
        { key: 'unknown', label: t.unknown, value: diagnostics.filter(item => item.riskLevel === 'unknown').length, tone: 'neutral' }
      ]}
    />
  );
}
