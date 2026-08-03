import type { DeliveryStatus, NotificationEventInput, NotificationGlobalSettings, NotificationRule, NotificationSeverity } from './types.js';

const rank: Record<NotificationSeverity, number> = { info:0, warning:1, error:2, critical:3 };
export interface DeliveryDecisionContext {
  global: NotificationGlobalSettings; channelEnabled: boolean; categoryEnabled: boolean; rule: NotificationRule | null;
  lastNotifiedAt: Date | null; duplicate: boolean; now: Date;
}

export function evaluateDelivery(event: NotificationEventInput, context: DeliveryDecisionContext): {status:DeliveryStatus;reason:string} {
  if (!context.global.enabled) return {status:'disabled',reason:'center_disabled'};
  if (!context.channelEnabled) return {status:'disabled',reason:'channel_disabled'};
  if (!context.categoryEnabled) return {status:'disabled',reason:'category_disabled'};
  if (!context.rule?.enabled) return {status:'disabled',reason:'event_disabled'};
  if (event.status === 'resolved' && !(context.rule.notifyOnRecovery && context.global.notifyOnRecovery)) return {status:'disabled',reason:'recovery_disabled'};
  if (rank[event.severity] < rank[context.global.minimumSeverity]) return {status:'filtered_by_severity',reason:'below_minimum_severity'};
  const cooldown = Math.max(0, context.rule.cooldownSeconds || context.global.defaultCooldownSeconds);
  if (context.lastNotifiedAt && context.now.getTime() - context.lastNotifiedAt.getTime() < cooldown * 1000) return {status:'cooldown',reason:'cooldown_active'};
  if (context.duplicate) return {status:'duplicate',reason:'duplicate_event'};
  return {status:'pending',reason:'eligible'};
}
export const decideDelivery=(event:NotificationEventInput,context:DeliveryDecisionContext)=>evaluateDelivery(event,context).status;
