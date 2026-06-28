import { StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnostic } from './trunkLabTypes';
import { registrationTone, riskTone } from './trunkLabUtils';

export function TrunkRiskBadge({ risk }: { risk: TrunkDiagnostic['riskLevel'] }) {
  return <StatusBadge tone={riskTone(risk)}>{ui.management.trunkLab.status.risk[risk]}</StatusBadge>;
}

export function TrunkRegistrationBadge({ status }: { status: TrunkDiagnostic['registrationStatus'] }) {
  return <StatusBadge tone={registrationTone(status)}>{ui.management.trunkLab.status.registration[status]}</StatusBadge>;
}

export function TrunkTechnologyBadge({ technology }: { technology: TrunkDiagnostic['technology'] }) {
  return <StatusBadge tone={technology === 'pjsip' ? 'info' : technology === 'chan_sip' ? 'warning' : 'neutral'}>{technology}</StatusBadge>;
}
