export interface NormalizedSiteFormPhone { raw: string; normalized: string; extension: string | null }

export function normalizeSiteFormPhone(value: unknown): NormalizedSiteFormPhone {
  const raw = String(value ?? '').trim().slice(0, 100);
  const extensionMatch = raw.match(/(?:доб\.?|ext\.?|extension)\s*(\d{1,8})/i);
  let digits = raw.replace(/(?:доб\.?|ext\.?|extension)\s*\d{1,8}.*$/i, '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return { raw, normalized: digits, extension: extensionMatch?.[1] || null };
}

export function isValidSiteFormPhone(value: unknown): boolean {
  const { normalized } = normalizeSiteFormPhone(value);
  return normalized.length >= 5 && normalized.length <= 15;
}
