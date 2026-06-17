export function formatSeconds(seconds: any): string {
  const n = Number(seconds || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;

  return `${m}:${String(s).padStart(2, '0')}`;
}
