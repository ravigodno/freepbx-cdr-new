import type { NotificationSeverity } from './types.js';

export interface NotificationEventDefinition {
  eventType: string; category: string; title: string; defaultSeverity: NotificationSeverity; producer: 'active' | 'registered'; recoveryType?: string;
}

export const NOTIFICATION_EVENT_CATALOG: NotificationEventDefinition[] = [
  { eventType:'balance.low', category:'balance', title:'Низкий баланс', defaultSeverity:'warning', producer:'active', recoveryType:'balance.recovered' },
  { eventType:'balance.recovered', category:'balance', title:'Баланс восстановлен', defaultSeverity:'info', producer:'active' },
  { eventType:'balance.minutes_low', category:'balance', title:'Заканчивается пакет минут', defaultSeverity:'warning', producer:'registered' },
  { eventType:'provider.sync_failed', category:'balance', title:'Ошибка синхронизации провайдера', defaultSeverity:'error', producer:'registered', recoveryType:'provider.sync_recovered' },
  { eventType:'provider.sync_recovered', category:'balance', title:'Синхронизация восстановлена', defaultSeverity:'info', producer:'registered' },
  { eventType:'calls.missed_unreturned', category:'calls', title:'Нет перезвона по пропущенному', defaultSeverity:'warning', producer:'active' },
  { eventType:'trunk.down', category:'telephony', title:'Транк недоступен', defaultSeverity:'critical', producer:'active', recoveryType:'trunk.recovered' },
  { eventType:'trunk.recovered', category:'telephony', title:'Транк восстановлен', defaultSeverity:'info', producer:'active' },
  { eventType:'asterisk.unavailable', category:'telephony', title:'Asterisk недоступен', defaultSeverity:'critical', producer:'registered', recoveryType:'asterisk.recovered' },
  { eventType:'asterisk.recovered', category:'telephony', title:'Asterisk восстановлен', defaultSeverity:'info', producer:'registered' },
  { eventType:'monitor.failed', category:'monitoring', title:'Ошибка фонового мониторинга', defaultSeverity:'error', producer:'registered', recoveryType:'monitor.recovered' },
  { eventType:'monitor.recovered', category:'monitoring', title:'Фоновый мониторинг восстановлен', defaultSeverity:'info', producer:'registered' },
  { eventType:'database.unavailable', category:'system', title:'База данных недоступна', defaultSeverity:'critical', producer:'active', recoveryType:'database.recovered' },
  { eventType:'database.recovered', category:'system', title:'База данных восстановлена', defaultSeverity:'info', producer:'active' },
  { eventType:'pbxpuls.critical_error', category:'system', title:'Критическая ошибка PBXPuls', defaultSeverity:'critical', producer:'active' },
  { eventType:'disk.space_critical', category:'system', title:'Критически мало места на диске', defaultSeverity:'critical', producer:'registered' },
  { eventType:'security.critical_event', category:'security', title:'Критическое событие безопасности', defaultSeverity:'critical', producer:'registered' }
];
