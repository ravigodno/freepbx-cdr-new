import { StatusTone } from '../../../components/ui/DesignSystem';
import { TrunkDiagnostic, TrunkLabFiltersState, TrunkLabRegistrationStatus, TrunkLabRiskLevel } from './trunkLabTypes';

export const initialTrunkLabFilters: TrunkLabFiltersState = {
  search: '',
  technology: 'all',
  risk: 'all',
  registration: 'all'
};

export function filterTrunkDiagnostics(items: TrunkDiagnostic[], filters: TrunkLabFiltersState): TrunkDiagnostic[] {
  const search = filters.search.trim().toLowerCase();
  return items.filter(item => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.summary.toLowerCase().includes(search);
    const matchesTechnology = filters.technology === 'all' || item.technology === filters.technology;
    const matchesRisk = filters.risk === 'all' || item.riskLevel === filters.risk;
    const matchesRegistration = filters.registration === 'all' || item.registrationStatus === filters.registration;
    return matchesSearch && matchesTechnology && matchesRisk && matchesRegistration;
  });
}

export function riskTone(risk: TrunkLabRiskLevel): StatusTone {
  if (risk === 'ok') return 'success';
  if (risk === 'warning') return 'warning';
  if (risk === 'critical') return 'error';
  return 'neutral';
}

export function registrationTone(status: TrunkLabRegistrationStatus): StatusTone {
  if (status === 'registered') return 'success';
  if (status === 'rejected' || status === 'auth_failed') return 'error';
  if (status === 'timeout' || status === 'unavailable') return 'warning';
  return 'neutral';
}

export function formatRawSnippet(value?: string): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
