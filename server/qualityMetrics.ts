export type QualityAvailability = 'online' | 'offline' | 'unknown';
export type QualityAssessment = 'good' | 'warning' | 'critical' | 'insufficient_data';
export type QualityMetricsSource = 'rtcp' | 'sip_rtt' | 'unknown';

export type QualityMetricDto = {
  registrationStatus: 'registered' | 'unregistered' | 'unknown';
  isRegistered: boolean;
  availabilityStatus: QualityAvailability;
  qualityStatus: QualityAssessment;
  sipRttMs: number | null;
  jitterMs: number | null;
  rtpLossPercent: number | null;
  mos: number | null;
  rtcpAvailable: boolean;
  metricsAvailable: boolean;
  metricsSource: QualityMetricsSource;
  statusReason: 'endpoint_unregistered' | 'rtcp_unavailable' | 'rtcp_normal' | 'rtcp_degraded' | 'registration_unknown';
  lastSeenAt: string | null;
};

export function finiteMetric(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function hasOwnMetric(source: any, ...keys: string[]): boolean {
  return keys.some(key => Object.prototype.hasOwnProperty.call(source || {}, key) && source[key] !== null && source[key] !== undefined && source[key] !== '');
}

export function normalizeQualityMetrics(device: any, now = new Date().toISOString()): QualityMetricDto {
  const rawStatus = String(device?.status || device?.deviceStatus || '').toLowerCase();
  const isOffline = rawStatus === 'offline' || rawStatus.includes('unavailable') || rawStatus.includes('unregistered');
  const isOnline = !isOffline && (rawStatus === 'online' || rawStatus.includes('avail') || rawStatus.includes('ok') || Boolean(device?.ip));
  const isRegistered = isOnline;
  const sipRttMs = isOffline ? null : finiteMetric(device?.sipRttMs, device?.signalingRtt, device?.rtt, device?.latency);
  const jitterMs = isOffline ? null : finiteMetric(device?.jitterMs, device?.rtcpJitter, device?.rtcp_jitter, device?.jitter);
  const explicitLoss = finiteMetric(device?.rtpLossPercent, device?.rtpLoss, device?.rtp_loss);
  const received = finiteMetric(device?.rtpReceivedPackets, device?.rtp_received_packets);
  const lost = finiteMetric(device?.rtpLostPackets, device?.rtp_lost_packets);
  const countersPresent = hasOwnMetric(device, 'rtpReceivedPackets', 'rtp_received_packets', 'rtpLostPackets', 'rtp_lost_packets');
  const counterTotal = (received || 0) + (lost || 0);
  const rtpLossPercent = isOffline ? null : explicitLoss !== null ? explicitLoss : countersPresent && counterTotal > 0 ? Number((((lost || 0) / counterTotal) * 100).toFixed(2)) : null;
  const mos = isOffline ? null : finiteMetric(device?.mos, device?.rtcpMos, device?.rtcp_mos);
  const rtcpAvailable = !isOffline && (Boolean(device?.rtcpAvailable) || jitterMs !== null || rtpLossPercent !== null || mos !== null || (countersPresent && counterTotal > 0));
  let qualityStatus: QualityAssessment = 'insufficient_data';
  if (rtcpAvailable) {
    const critical = (jitterMs !== null && jitterMs > 30) || (rtpLossPercent !== null && rtpLossPercent > 3) || (mos !== null && mos < 3.5);
    const warning = (jitterMs !== null && jitterMs > 20) || (rtpLossPercent !== null && rtpLossPercent > 1) || (mos !== null && mos < 4);
    qualityStatus = critical ? 'critical' : warning ? 'warning' : 'good';
  }
  const availabilityStatus: QualityAvailability = isOffline ? 'offline' : isOnline ? 'online' : 'unknown';
  return {
    registrationStatus: isOffline ? 'unregistered' : isOnline ? 'registered' : 'unknown', isRegistered,
    availabilityStatus, qualityStatus, sipRttMs, jitterMs, rtpLossPercent, mos, rtcpAvailable,
    metricsAvailable: rtcpAvailable, metricsSource: rtcpAvailable ? 'rtcp' : sipRttMs !== null ? 'sip_rtt' : 'unknown',
    statusReason: isOffline ? 'endpoint_unregistered' : !isOnline ? 'registration_unknown' : !rtcpAvailable ? 'rtcp_unavailable' : qualityStatus === 'good' ? 'rtcp_normal' : 'rtcp_degraded',
    lastSeenAt: device?.lastSeenAt || device?.last_seen_at || (isOnline ? now : null)
  };
}
