export type LogSeverity = 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
export type LogCategory = 'asterisk' | 'security' | 'fail2ban' | 'web' | 'system' | 'pbxpuls' | 'other';
export type LogSourceType = 'file' | 'journald' | 'database' | 'pm2';

export interface LogSourceDefinition {
  sourceKey: string; displayName: string; category: LogCategory; sourceType: LogSourceType;
  canonicalPath?: string; journalUnit?: string; parserKey: string; platform: string; collectorVersion: string;
}

export interface DetectedLogSource extends LogSourceDefinition {
  detected: boolean; readable: boolean; active: boolean; fileSize?: number; inode?: string;
  modifiedAt?: string | null; lastReadAt?: string | null; lastEventAt?: string | null; readError?: string | null;
}

export interface NormalizedLogEvent {
  eventId?: number; occurredAt: string; receivedAt: string; sourceKey: string; sourceName: string;
  category: LogCategory; severity: LogSeverity; eventType: string; title: string; message: string; rawMessage: string;
  host?: string; process?: string; pid?: number; module?: string; ip?: string; port?: number; protocol?: string;
  username?: string; extension?: string; sipPeer?: string; trunk?: string; channel?: string; callId?: string;
  uniqueid?: string; linkedid?: string; httpMethod?: string; httpPath?: string; httpStatus?: number; service?: string;
  jail?: string; fingerprint: string; dedupKey: string; count: number; firstSeenAt: string; lastSeenAt: string;
  parserConfidence: number; tags: string[]; recommendedActions: string[]; contextBefore?: string[]; contextAfter?: string[];
  correlationId?: string; relatedEventIds?: number[]; correlationType?: string; correlationConfidence?: number;
}

export interface LogCursor {
  sourceKey: string; inode?: string; offset: number; fileSize: number; modifiedAt?: string; journalCursor?: string;
  lastLineHash?: string; lastReadAt?: string;
}

export interface LogReadResult {
  lines: string[]; nextCursor: LogCursor; bytesRead: number; rotated: boolean; truncated: boolean; durationMs: number;
}
