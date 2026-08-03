export type NotificationSeverity = 'info' | 'warning' | 'error' | 'critical';
export type NotificationEventStatus = 'active' | 'resolved';
export type NotificationState = 'normal' | 'problem' | 'recovered';
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'retry_scheduled' | 'disabled' | 'filtered_by_severity' | 'cooldown' | 'duplicate';

export interface NotificationEventInput {
  eventType: string;
  category: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  source: string;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey: string;
  status: NotificationEventStatus;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface NotificationRule {
  eventType: string;
  category: string;
  enabled: boolean;
  severity: NotificationSeverity;
  cooldownSeconds: number;
  notifyOnRecovery: boolean;
  parameters: Record<string, unknown>;
}

export interface NotificationGlobalSettings {
  enabled: boolean;
  objectName: string;
  minimumSeverity: NotificationSeverity;
  notifyOnRecovery: boolean;
  defaultCooldownSeconds: number;
  categories: Record<string, boolean>;
}
