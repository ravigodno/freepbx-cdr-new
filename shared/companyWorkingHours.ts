export const DEFAULT_COMPANY_WORK_START = '08:00';
export const DEFAULT_COMPANY_WORK_END = '19:00';

export interface CompanyWorkingHours {
  start: string;
  end: string;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function normalizeCompanyWorkingHours(settings: any): CompanyWorkingHours {
  const start = String(settings?.companyWorkStart || DEFAULT_COMPANY_WORK_START).trim();
  const end = String(settings?.companyWorkEnd || DEFAULT_COMPANY_WORK_END).trim();
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || toMinutes(start) >= toMinutes(end)) {
    return { start: DEFAULT_COMPANY_WORK_START, end: DEFAULT_COMPANY_WORK_END };
  }
  return { start, end };
}

export function isWithinCompanyWorkingHours(date: Date, hours: CompanyWorkingHours): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= toMinutes(hours.start) && minutes < toMinutes(hours.end);
}
