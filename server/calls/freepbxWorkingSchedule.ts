/** FreePBX Time Group expressions; no installation-specific working hours. */
export type WorkingRule = { times: string[]; timezone: string; match: boolean; conditionId?: string };
export type WorkingSchedule = WorkingRule[][];
const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function matchesRange(raw: string, value: number, names?: string[]): boolean {
  if (raw === '*') return true;
  const number = (s: string) => names ? names.indexOf(s.toLowerCase()) : Number(s);
  return raw.split('&').some(part => {
    const bits = part.split('-');
    const a = number(bits[0]); const b = number(bits[1] ?? bits[0]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw Error('Unsupported Time Group range');
    return a <= b ? value >= a && value <= b : value >= a || value <= b;
  });
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function matchesRule(rule: WorkingRule, ms: number): boolean {
  if (!formatters.has(rule.timezone)) formatters.set(rule.timezone, new Intl.DateTimeFormat('en-US', {
    timeZone: rule.timezone, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }));
  const p = Object.fromEntries(formatters.get(rule.timezone)!.formatToParts(ms).map(p => [p.type, p.value]));
  const minute = Number(p.hour) * 60 + Number(p.minute);
  const result = rule.times.some(expression => {
    const fields = expression.split('|');
    if (fields.length !== 4) throw Error('Unsupported Time Group expression');
    const [time, days, dates, month] = fields;
    const clock = (s: string) => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw Error('Invalid Time Group clock');
      const [h, m] = s.split(':').map(Number); return h * 60 + m;
    };
    const inTime = time === '*' || time.split('&').some(range => {
      const [from, to] = range.split('-').map(clock);
      if (to === undefined) throw Error('Invalid Time Group interval');
      // Asterisk GotoIfTime includes the complete final minute.
      return from <= to ? minute >= from && minute <= to : minute >= from || minute <= to;
    });
    return inTime && matchesRange(days, weekdays.indexOf(p.weekday.toLowerCase()), weekdays)
      && matchesRange(dates, Number(p.day)) && matchesRange(month, months.indexOf(p.month.toLowerCase()), months);
  });
  return result === rule.match;
}
export function isWorkingTime(schedule: WorkingSchedule, ms: number): boolean {
  return schedule.some(path => path.every(rule => matchesRule(rule, ms)));
}

// Bounded cache of UTC-day intervals. UTC iteration preserves timezone/DST changes.
const daysCache = new Map<string, Array<[number, number]>>();
function intervals(schedule: WorkingSchedule, day: number): Array<[number, number]> {
  const key = JSON.stringify(schedule) + ':' + day;
  const cached = daysCache.get(key); if (cached) return cached;
  const result: Array<[number, number]> = [];
  for (let ms = day; ms < day + 86400000; ms += 60000) {
    if (!isWorkingTime(schedule, ms)) continue;
    const last = result[result.length - 1];
    if (last && last[1] === ms) last[1] += 60000;
    else result.push([ms, ms + 60000]);
  }
  if (daysCache.size >= 1024) daysCache.clear();
  daysCache.set(key, result); return result;
}
export function workingDeadline(schedule: WorkingSchedule, start: number, budget: number): number {
  let remaining = budget;
  for (let day = Math.floor(start / 86400000) * 86400000, count = 0; count < 370; day += 86400000, count++) {
    for (const [a, b] of intervals(schedule, day)) {
      const from = Math.max(start, a); if (from >= b) continue;
      if (remaining <= b - from) return from + remaining;
      remaining -= b - from;
    }
  }
  return Infinity; // No known opening: never fabricate an expired SLA.
}
export function workingElapsed(schedule: WorkingSchedule, start: number, end: number): number {
  if (end <= start) return 0;
  let total = 0;
  for (let day = Math.floor(start / 86400000) * 86400000; day < end; day += 86400000) {
    for (const [a, b] of intervals(schedule, day)) total += Math.max(0, Math.min(end, b) - Math.max(start, a));
  }
  return total;
}
