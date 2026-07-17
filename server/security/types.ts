export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type SecurityAvailability = 'local_only' | 'lan_only' | 'external_possible' | 'externally_exposed' | 'unknown';

export interface SecurityFirewallRule {
  id: string;
  family: 'ipv4' | 'ipv6' | 'inet' | 'unknown';
  table?: string; chain?: string;
  action: 'accept' | 'drop' | 'reject' | 'log' | 'other';
  protocol?: 'tcp' | 'udp' | 'icmp' | 'all' | 'other';
  source?: string; destination?: string; sourcePort?: string; destinationPort?: string;
  interfaceIn?: string; interfaceOut?: string; packets?: number; bytes?: number; raw?: string;
  risk: SecuritySeverity; riskReason?: string;
}

export interface SecurityListeningPort {
  protocol: 'tcp' | 'udp'; address: string; port: number; process?: string; pid?: number; user?: string;
  service?: string; exposure: SecurityAvailability; risk: SecuritySeverity; riskReason?: string;
}

export interface SecurityCheckResult {
  id: string; group: string; title: string;
  status: 'passed' | 'warning' | 'failed' | 'unknown' | 'not_applicable';
  severity: SecuritySeverity; summary: string; details?: string; recommendation?: string;
  evidence?: Record<string, unknown>; checkedAt: string;
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
