export type RtcpEndpointMetrics = {
  endpoint: string;
  jitterMs: number;
  rtpLossPercent: number;
  mos: number | null;
  rtpReceivedPackets: number;
  rtpLostPackets: number;
  rtcpAvailable: true;
  metricsSource: 'rtcp';
  measuredAt: string;
};

const MAX_ENDPOINTS = 500;
const METRIC_TTL_MS = 24 * 60 * 60 * 1000;
const metricsByEndpoint = new Map<string, RtcpEndpointMetrics>();

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function endpointFromAsteriskChannel(channel: string): string | null {
  const value = String(channel || '').trim();
  const match = value.match(/^(?:PJSIP|SIP)\/(.+)-[0-9a-f]+$/i);
  return match?.[1]?.trim() || null;
}

export function qualityVariableForChannel(channel: string): string | null {
  if (/^PJSIP\//i.test(String(channel || ''))) return 'CHANNEL(rtcp,all)';
  if (/^SIP\//i.test(String(channel || ''))) return 'CHANNEL(rtpqos,audio,all)';
  return null;
}

function calculateMosFromRtp(jitterMs: number, lossPercent: number, rttSeconds: number | null): number | null {
  if (rttSeconds === null || rttSeconds <= 0) return null;
  const effectiveLatencyMs = rttSeconds * 500 + jitterMs * 2;
  const rFactor = Math.max(0, Math.min(93.2, 93.2 - effectiveLatencyMs / 40 - lossPercent * 2.5));
  const mos = 1 + 0.035 * rFactor + rFactor * (rFactor - 60) * (100 - rFactor) * 0.000007;
  return Number(Math.max(1, Math.min(4.5, mos)).toFixed(2));
}

function normalizeAsteriskMes(value: unknown): number | null {
  const score = finite(value);
  if (score === null || score <= 0) return null;
  if (score <= 5) return Number(score.toFixed(2));
  if (score > 100) return null;
  const mos = 1 + 0.035 * score + score * (score - 60) * (100 - score) * 0.000007;
  return Number(Math.max(1, Math.min(4.5, mos)).toFixed(2));
}

export function parseAsteriskRtcpAll(value: string): Omit<RtcpEndpointMetrics, 'endpoint' | 'measuredAt'> | null {
  const fields: Record<string, string> = {};
  String(value || '').split(';').forEach(part => {
    const separator = part.indexOf('=');
    if (separator > 0) fields[part.slice(0, separator).trim().toLowerCase()] = part.slice(separator + 1).trim();
  });

  const rxCount = finite(fields.rxcount) || 0;
  const txCount = finite(fields.txcount) || 0;
  if (rxCount + txCount <= 0) return null;

  // Asterisk CHANNEL(rtcp,all) reports jitter in seconds.
  const rxJitterSeconds = finite(fields.rxjitter);
  const txJitterSeconds = finite(fields.txjitter);
  const jitterSeconds = Math.max(rxJitterSeconds || 0, txJitterSeconds || 0);
  const localLost = finite(fields.lp) || 0;
  const remoteLost = finite(fields.rlp) || 0;
  const receiveLoss = rxCount + localLost > 0 ? localLost / (rxCount + localLost) : 0;
  const transmitLoss = txCount + remoteLost > 0 ? remoteLost / (txCount + remoteLost) : 0;
  const mes = [normalizeAsteriskMes(fields.txmes), normalizeAsteriskMes(fields.rxmes)].filter((item): item is number => item !== null);
  const jitterMs = Number((jitterSeconds * 1000).toFixed(2));
  const rtpLossPercent = Number((Math.max(receiveLoss, transmitLoss) * 100).toFixed(2));
  const reportedMos = mes.length ? Number(Math.min(...mes).toFixed(2)) : null;

  return {
    jitterMs,
    rtpLossPercent,
    mos: reportedMos ?? calculateMosFromRtp(jitterMs, rtpLossPercent, finite(fields.rtt)),
    rtpReceivedPackets: rxCount,
    rtpLostPackets: localLost,
    rtcpAvailable: true,
    metricsSource: 'rtcp'
  };
}

export function recordAsteriskRtcpQuality(channel: string, value: string, measuredAt = new Date().toISOString()): RtcpEndpointMetrics | null {
  const endpoint = endpointFromAsteriskChannel(channel);
  const parsed = parseAsteriskRtcpAll(value);
  if (!endpoint || !parsed) return null;
  const previous = metricsByEndpoint.get(endpoint);
  const metric = {
    endpoint,
    ...parsed,
    // A final Hangup sample may still contain packet counters but no MES/RTT.
    // Do not erase the last valid MOS measured earlier on the same media channel.
    mos: parsed.mos ?? previous?.mos ?? null,
    measuredAt
  };
  metricsByEndpoint.delete(endpoint);
  metricsByEndpoint.set(endpoint, metric);
  while (metricsByEndpoint.size > MAX_ENDPOINTS) metricsByEndpoint.delete(metricsByEndpoint.keys().next().value as string);
  return metric;
}

export function getLatestRtcpQuality(endpoint: string, now = Date.now()): RtcpEndpointMetrics | null {
  const metric = metricsByEndpoint.get(String(endpoint || '').trim());
  if (!metric) return null;
  if (now - Date.parse(metric.measuredAt) > METRIC_TTL_MS) {
    metricsByEndpoint.delete(metric.endpoint);
    return null;
  }
  return metric;
}
