export type ProcStatCpuSample = {
  total: number;
  idle: number;
};

export function parseProcStatCpuSample(content: string): ProcStatCpuSample | null {
  const cpuLine = String(content || '').split(/\r?\n/).find(line => /^cpu\s+/.test(line));
  if (!cpuLine) return null;

  const values = cpuLine.trim().split(/\s+/).slice(1, 9).map(Number);
  if (values.length < 4 || values.some(value => !Number.isFinite(value) || value < 0)) return null;

  const total = values.reduce((sum, value) => sum + value, 0);
  const idle = Number(values[3] || 0) + Number(values[4] || 0);
  return total > 0 ? { total, idle } : null;
}

export function calculateCpuPercent(previous: ProcStatCpuSample | null, current: ProcStatCpuSample | null): number | null {
  if (!previous || !current) return null;

  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0 || idleDelta < 0) return null;

  const busyPercent = 100 * (1 - Math.min(idleDelta, totalDelta) / totalDelta);
  return Math.max(0, Math.min(100, Math.round(busyPercent * 10) / 10));
}
