import { serverLocalDateTimeToBrowser } from './serverClock';
import { getCdrDateFormat, loadInterfacePreferences, type CdrDateTimeFormat, type InterfacePreferences } from './interfacePreferences';

export function formatCdrDateTime(value: string, format: CdrDateTimeFormat, showSeconds: boolean, useBrowserTimezone: boolean, hourCycle: 12 | 24): string {
  if (useBrowserTimezone) {
    const browserDate = serverLocalDateTimeToBrowser(value);
    if (browserDate) value = `${browserDate.getFullYear()}-${String(browserDate.getMonth()+1).padStart(2,'0')}-${String(browserDate.getDate()).padStart(2,'0')} ${String(browserDate.getHours()).padStart(2,'0')}:${String(browserDate.getMinutes()).padStart(2,'0')}:${String(browserDate.getSeconds()).padStart(2,'0')}`;
  }
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, year, month, day, hour, minute, second] = match;
  const numericHour = Number(hour);
  const displayHour = hourCycle === 12 ? String(numericHour % 12 || 12).padStart(2, '0') : hour;
  const suffix = hourCycle === 12 ? (numericHour >= 12 ? ' PM' : ' AM') : '';
  const time = `${displayHour}:${minute}${showSeconds ? `:${second}` : ''}${suffix}`;
  const dateFormat = getCdrDateFormat(format);
  const separator = dateFormat === 'dmy-dot' ? '.' : dateFormat === 'dmy-slash' ? '/' : '-';
  const date = dateFormat === 'ymd-dash' ? `${year}-${month}-${day}`
    : dateFormat === 'dmy-short-dash' ? `${day}-${month}-${year.slice(-2)}`
    : `${day}${separator}${month}${separator}${year}`;
  return format.startsWith('time-first:') ? `${time} ${date}` : `${date} ${time}`;
}

export function createInterfaceDateTimeFormatter(preferences: InterfacePreferences = loadInterfacePreferences()) {
  return (value: unknown): string => value ? formatCdrDateTime(String(value), preferences.cdrDateTimeFormat, preferences.cdrShowSeconds, preferences.cdrUseBrowserTimezone, preferences.cdrHourCycle) : '—';
}
