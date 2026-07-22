const SENSITIVE_KEY = /(?:api.?key|authorization|password|passwd|secret|token|credential|ami.?pass|ari.?pass|sip.?secret)/i;
const MAX_STRING = 4000;

export interface RedactionStats {
  secrets: number;
  emails: number;
  ips: number;
  phones: number;
  paths: number;
  truncated: number;
}

export function redactAiPlatformText(value: unknown, stats?: RedactionStats): string {
  const counters = stats || { secrets: 0, emails: 0, ips: 0, phones: 0, paths: 0, truncated: 0 };
  let text = String(value ?? '').normalize('NFKC');
  if (text.length > MAX_STRING) { text = text.slice(0, MAX_STRING); counters.truncated++; }
  text = text.replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;)]+/gi, (_m, p) => { counters.secrets++; return `${p}********`; });
  text = text.replace(/(\bbearer\s+)[A-Za-z0-9._~+/-]{8,}/gi, (_m, p) => { counters.secrets++; return `${p}********`; });
  text = text.replace(/((?:api.?key|password|passwd|secret|token|ami.?pass|ari.?pass|sip.?secret)\s*[:=]\s*)[^\s,;)]+/gi, (_m, p) => { counters.secrets++; return `${p}********`; });
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => { counters.emails++; return '[EMAIL]'; });
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b|\b[0-9a-f]{0,4}:[0-9a-f:]{2,}\b/gi, () => { counters.ips++; return '[IP]'; });
  text = text.replace(/[A-Z]:\\[^\s]+|\/(?:var|home|root|etc|opt|tmp)\/[^\s]+/gi, () => { counters.paths++; return '[PATH]'; });
  text = text.replace(/\+?\d[\d() .-]{5,}\d/g, () => { counters.phones++; return '[PHONE]'; });
  return text;
}

export function redactAiPlatformValue(value: unknown): { value: unknown; stats: RedactionStats } {
  const stats: RedactionStats = { secrets: 0, emails: 0, ips: 0, phones: 0, paths: 0, truncated: 0 };
  const visit = (item: unknown, key = ''): unknown => {
    if (item === null || item === undefined || typeof item === 'number' || typeof item === 'boolean') return item;
    if (typeof item === 'string') return SENSITIVE_KEY.test(key) ? (stats.secrets++, '********') : redactAiPlatformText(item, stats);
    if (Array.isArray(item)) return item.slice(0, 100).map(entry => visit(entry, key));
    if (typeof item === 'object') {
      const output: Record<string, unknown> = {};
      for (const [childKey, child] of Object.entries(item as Record<string, unknown>).slice(0, 100)) {
        output[childKey] = SENSITIVE_KEY.test(childKey) ? (stats.secrets++, '********') : visit(child, childKey);
      }
      return output;
    }
    return redactAiPlatformText(item, stats);
  };
  return { value: visit(value), stats };
}

export function parseJsonObject(value: unknown, field: string): Record<string, unknown> {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error(`${field} must be a JSON object`);
  return parsed as Record<string, unknown>;
}
