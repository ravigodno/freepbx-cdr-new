export type NullableMetric = number | null;
export type AvailabilityStatus = 'online' | 'offline' | 'unknown';
export type QualityStatus = 'good' | 'warning' | 'critical' | 'insufficient_data';

export function hasMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatMetric(value: NullableMetric, suffix: string, missing = 'Нет RTCP', digits?: number): string {
  if (!hasMetric(value)) return missing;
  const formatted = digits === undefined ? String(value) : value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${formatted}${suffix}`;
}

export function averageMetric<T>(items: T[], select: (item: T) => unknown, digits = 2): number | null {
  const values = items.map(select).filter(hasMetric);
  if (!values.length) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits));
}

export function compareNullableMetrics(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  const aPresent = hasMetric(a), bPresent = hasMetric(b);
  if (!aPresent && !bPresent) return 0;
  if (!aPresent) return 1;
  if (!bPresent) return -1;
  return direction === 'asc' ? a - b : b - a;
}

export function availabilityLabel(status: AvailabilityStatus): string {
  return status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Неизвестно';
}

export function qualityLabel(status: QualityStatus): string {
  return status === 'good' ? 'Качество: хорошо' : status === 'warning' ? 'Качество: предупреждение' : status === 'critical' ? 'Проблемы качества' : 'Качество: Нет RTCP';
}
