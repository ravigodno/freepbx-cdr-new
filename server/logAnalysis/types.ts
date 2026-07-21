export type LogSeverity = 'critical' | 'error' | 'warning' | 'notice' | 'info' | 'debug';
export type LogCategory = 'asterisk' | 'security' | 'fail2ban' | 'web' | 'system' | 'pbxpuls' | 'other';
export type LogSourceType = 'file' | 'directory' | 'journald' | 'database' | 'pm2';
export type LogSourceGroup = 'Asterisk'|'FreePBX'|'SIP и телефония'|'Очереди'|'Безопасность'|'Веб-сервер'|'PHP'|'База данных'|'Система'|'PBXPuls'|'Прочее';

export interface LogSourceDefinition {
  sourceKey: string; displayName: string; category: LogCategory; sourceType: LogSourceType;
  canonicalPath?: string; journalUnit?: string; parserKey: string; platform: string; collectorVersion: string;
  group?: LogSourceGroup; sensitivity?: 'normal'|'sensitive'|'high'; supportedFields?: string[]; supportsLogrotate?: boolean; discovered?: boolean;
}

export interface DetectedLogSource extends LogSourceDefinition {
  detected: boolean; readable: boolean; active: boolean; fileSize?: number; inode?: string;
  modifiedAt?: string | null; lastReadAt?: string | null; lastEventAt?: string | null; readError?: string | null;
  unavailableReason?: string|null; rotatedPaths?: string[]; eventCount?: number;
}

export interface NormalizedLogEvent {
  eventId?: number; occurredAt: string; receivedAt: string; sourceKey: string; sourceName: string;
  category: LogCategory; severity: LogSeverity; eventType: string; title: string; message: string; rawMessage: string;
  host?: string; process?: string; pid?: number; module?: string; ip?: string; port?: number; protocol?: string;
  username?: string; extension?: string; sipPeer?: string; trunk?: string; channel?: string; callId?: string;
  uniqueid?: string; linkedid?: string; httpMethod?: string; httpPath?: string; httpStatus?: number; service?: string;
  phone?: string; dialplanContext?: string; application?: string; jail?: string; fingerprint: string; dedupKey: string; count: number; firstSeenAt: string; lastSeenAt: string;
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
