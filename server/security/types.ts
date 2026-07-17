export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type SecurityAvailability = 'local_only' | 'lan_only' | 'external_possible' | 'externally_exposed' | 'unknown';
export type SecurityTabKey = 'overview' | 'events' | 'sip' | 'firewall' | 'fail2ban' | 'ports' | 'checks' | 'services' | 'changes' | 'alerts' | 'settings';

export type SecurityNavigationTarget = {
  tab: SecurityTabKey;
  filters?: {
    ports?: number[]; service?: string; category?: string; severity?: string;
    sourceIp?: string; jail?: string; search?: string;
  };
};

export interface SecurityFirewallRule {
  id: string;
  family: 'ipv4' | 'ipv6' | 'inet' | 'unknown';
  table?: string; chain?: string;
  action: 'accept' | 'drop' | 'reject' | 'log' | 'other';
  protocol?: 'tcp' | 'udp' | 'icmp' | 'all' | 'other';
  source?: string; destination?: string; sourcePort?: string; destinationPort?: string;
  interfaceIn?: string; interfaceOut?: string; packets?: number; bytes?: number; raw?: string;
  sourceMechanism?: 'iptables' | 'firewalld' | 'freepbx' | 'nftables' | 'ufw'; chainPolicy?: string;
  risk: SecuritySeverity; riskReason?: string;
}

export interface SecurityListeningPort {
  protocol: 'tcp' | 'udp'; address: string; port: number; process?: string; pid?: number; user?: string;
  family?: 'ipv4' | 'ipv6'; service?: string; exposure: SecurityAvailability; risk: SecuritySeverity; riskReason?: string;
}

export interface PortFirewallAnalysis {
  port: number; protocol: 'tcp' | 'udp'; address: string;
  matchedRules: SecurityFirewallRule[];
  effectiveAccess: 'local_only' | 'lan_only' | 'firewall_blocked' | 'external_possible' | 'externally_exposed' | 'conflicting' | 'unknown';
  confidence: 'low' | 'medium' | 'high'; explanation: string; recommendation?: string;
  chainPolicy?: string; debugTrail: string[];
}

export interface SecurityCheckResult {
  id: string; group: string; title: string;
  status: 'passed' | 'warning' | 'failed' | 'unknown' | 'not_applicable';
  severity: SecuritySeverity; summary: string; details?: string; recommendation?: string;
  checkId?: string; targetTab?: SecurityTabKey; relatedPorts?: number[]; service?: string;
  category?: string; sourceIp?: string; navigation?: SecurityNavigationTarget;
  evidence?: Record<string, unknown>; metadata?: Record<string, unknown>; checkedAt: string;
}

export interface SecurityEventInput {
  occurredAt: string; severity: SecuritySeverity; category: string; source: string; sourceFile?: string;
  sourceIp?: string; sourcePort?: number; destinationIp?: string; destinationPort?: number; protocol?: string;
  extension?: string; username?: string; jail?: string; service?: string; action?: string;
  result?: 'allowed' | 'blocked' | 'failed' | 'success' | 'unknown'; title: string; description: string;
  rawExcerpt?: string; metadata?: Record<string, unknown>;
}

export interface SecurityCommandResult {
  ok: boolean; command: string; stdout: string; stderr: string; exitCode: number | null;
  timedOut: boolean; unavailable: boolean; durationMs: number;
}
