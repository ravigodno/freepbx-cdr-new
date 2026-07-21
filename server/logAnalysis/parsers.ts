import os from 'os';
import { buildLogFingerprint, normalizeFingerprintMessage, sanitizeLogText } from './redaction.js';
import type { LogCategory, LogSeverity, LogSourceDefinition, NormalizedLogEvent } from './types.js';

type Rule = { re: RegExp; type: string; title: string; severity: LogSeverity; recommendations?: string[]; tags?: string[] };
const DIAG = {
  sip: ['Проверьте DNS и доступность SIP-адреса провайдера.', 'Проверьте firewall/NAT и срок регистрации.', 'Перейдите в SNGREP или TCPDUMP для проверки ответных пакетов.'],
  auth: ['Проверьте источник IP и частоту попыток.', 'Проверьте Fail2Ban и доверенные адреса.', 'Перейдите в раздел «Безопасность».'],
  disk: ['Проверьте использование дисков, размеры журналов и записей разговоров.', 'Проверьте состояние logrotate; не удаляйте данные без проверки.'],
  db: ['Проверьте MariaDB, число соединений и нагрузку.', 'Проверьте PBXPuls SQL Status и журнал приложения.']
};

const RULES: Record<string, Rule[]> = {
  asterisk: [
    { re: /registered\b|added contact/i, type: 'sip_registered', title: 'SIP-устройство зарегистрировано', severity: 'info' },
    { re: /registration.*(?:timeout|timed out)|no response.*(?:sip|provider)|request timeout|retransmission timeout/i, type: 'sip_registration_timeout', title: 'Таймаут SIP-регистрации', severity: 'error', recommendations: DIAG.sip },
    { re: /(?:pjsip|chan_sip).*(?:auth.*fail|forbidden|unauthorized|reject)|failed to authenticate/i, type: 'sip_authentication_failed', title: 'Ошибка SIP-аутентификации', severity: 'warning', recommendations: DIAG.auth },
    { re: /peer\s+'[^']+'.*(?:unreachable|lagged)|contact.*unavailable/i, type: 'sip_peer_unreachable', title: 'SIP-узел недоступен', severity: 'warning', recommendations: DIAG.sip },
    { re: /peer\s+'[^']+'.*(?:reachable)|contact.*available/i, type: 'sip_peer_reachable', title: 'SIP-узел доступен', severity: 'info' },
    { re: /rtp.*(?:timeout|no audio)|one.way audio/i, type: 'rtp_timeout', title: 'Проблема RTP/аудио', severity: 'warning', recommendations: DIAG.sip },
    { re: /agi.*(?:error|failed|exception|exit status)/i, type: 'agi_error', title: 'Ошибка AGI', severity: 'error' },
    { re: /(?:no route|route not found|extension not found|invalid extension)/i, type: 'dialplan_route_missing', title: 'Маршрут dialplan не найден', severity: 'error' },
    { re: /(?:congestion|channel unavailable|all circuits are busy)/i, type: 'channel_unavailable', title: 'Канал недоступен', severity: 'error' },
    { re: /(?:module.*(?:load|loading).*fail|error loading module)/i, type: 'module_load_failed', title: 'Ошибка загрузки модуля Asterisk', severity: 'critical' },
    { re: /(?:recording|mixmonitor).*(?:error|failed|permission denied)/i, type: 'recording_failed', title: 'Ошибка записи разговора', severity: 'error' },
    { re: /(?:reload|reloading|asterisk.*(?:started|restart))/i, type: 'asterisk_lifecycle', title: 'Asterisk reload/restart', severity: 'notice' },
    { re: /\bERROR\b/i, type: 'asterisk_error', title: 'Ошибка Asterisk', severity: 'error' },
    { re: /\bWARNING\b/i, type: 'asterisk_warning', title: 'Предупреждение Asterisk', severity: 'warning' },
    { re: /\bNOTICE\b/i, type: 'asterisk_notice', title: 'Уведомление Asterisk', severity: 'notice' },
    { re: /\bDEBUG\b/i, type: 'asterisk_debug', title: 'Отладочное событие Asterisk', severity: 'debug' }
  ],
  auth: [
    { re: /failed password|authentication failure/i, type: 'ssh_auth_failed', title: 'Неудачная SSH-аутентификация', severity: 'warning', recommendations: DIAG.auth },
    { re: /invalid user/i, type: 'ssh_invalid_user', title: 'Попытка входа неизвестного пользователя', severity: 'warning', recommendations: DIAG.auth },
    { re: /accepted publickey/i, type: 'ssh_login_publickey', title: 'Успешный SSH-вход по ключу', severity: 'notice' },
    { re: /accepted password/i, type: 'ssh_login_password', title: 'Успешный SSH-вход по паролю', severity: 'notice' },
    { re: /session opened/i, type: 'session_opened', title: 'Сессия открыта', severity: 'info' },
    { re: /session closed/i, type: 'session_closed', title: 'Сессия закрыта', severity: 'info' },
    { re: /sudo.*(?:failure|incorrect password|not in sudoers)/i, type: 'sudo_failed', title: 'Ошибка sudo', severity: 'warning' }
  ],
  fail2ban: [
    { re: /\bBan\b/i, type: 'fail2ban_ban', title: 'Fail2Ban заблокировал IP', severity: 'notice' },
    { re: /\bUnban\b/i, type: 'fail2ban_unban', title: 'Fail2Ban разблокировал IP', severity: 'info' },
    { re: /\bFound\b/i, type: 'fail2ban_found', title: 'Fail2Ban обнаружил нарушение', severity: 'warning' },
    { re: /(?:jail|filter).*(?:error|failed)|unable to.*ban/i, type: 'fail2ban_error', title: 'Ошибка Fail2Ban', severity: 'error' }
  ],
  web: [
    { re: /(?:\.env|wp-login\.php|phpmyadmin|\.\.\/|%2e%2e)/i, type: 'http_suspicious_path', title: 'Запрос подозрительного пути', severity: 'warning', recommendations: DIAG.auth },
    { re: /"\s500\s|\b500\b.*(?:error|php)|\b502\b|\b503\b|\b504\b|upstream.*(?:timeout|refused)/i, type: 'http_server_error', title: 'Ошибка веб-сервера', severity: 'error' },
    { re: /"\s(?:401|403)\s/i, type: 'http_auth_denied', title: 'HTTP-доступ отклонён', severity: 'warning', recommendations: DIAG.auth },
    { re: /"\s404\s/i, type: 'http_not_found', title: 'HTTP 404', severity: 'notice' },
    { re: /php (?:fatal|warning)|apache.*error|httpd.*error/i, type: 'web_runtime_error', title: 'Ошибка PHP/веб-сервера', severity: 'error' }
  ],
  system: [
    { re: /out of memory|oom-killer|killed process/i, type: 'out_of_memory', title: 'Нехватка памяти', severity: 'critical' },
    { re: /no space left on device|disk full/i, type: 'disk_full', title: 'Закончилось место на диске', severity: 'critical', recommendations: DIAG.disk },
    { re: /read-only file system/i, type: 'filesystem_read_only', title: 'Файловая система только для чтения', severity: 'critical', recommendations: DIAG.disk },
    { re: /(?:i\/o error|filesystem error|segmentation fault)/i, type: 'system_fault', title: 'Системная ошибка', severity: 'error' },
    { re: /(?:failed|failure).*\.service|\.service:.*(?:failed|failure)|service.*(?:crash|restart loop)/i, type: 'service_failed', title: 'Сбой системной службы', severity: 'error' },
    { re: /(?:network.*link|carrier).*(?:down|lost)/i, type: 'network_link_down', title: 'Сетевой интерфейс потерял связь', severity: 'warning' },
    { re: /(?:dns|name resolution).*(?:fail|timeout)|temporary failure in name resolution/i, type: 'dns_failed', title: 'Ошибка DNS', severity: 'warning' },
    { re: /(?:certificate|tls|ssl).*(?:expired|error|fail)/i, type: 'certificate_error', title: 'Ошибка TLS/сертификата', severity: 'error' },
    { re: /permission denied/i, type: 'permission_denied', title: 'Отказано в доступе', severity: 'error' },
    { re: /connection refused|connect.*timeout|database unavailable/i, type: 'connection_failed', title: 'Ошибка подключения', severity: 'error' }
  ],
  pbxpuls: [
    { re: /unhandled.*(?:exception|rejection)|uncaught/i, type: 'unhandled_exception', title: 'Необработанное исключение PBXPuls', severity: 'critical' },
    { re: /\b(?:api end|http)\b.*\b500\b|\b500\b.*api/i, type: 'api_500', title: 'PBXPuls API вернул 500', severity: 'error' },
    { re: /(?:pbxpuls_db|mariadb|mysql).*(?:timeout|timedout|refused|unavailable|access denied)/i, type: 'pbxpuls_db_timeout', title: 'PBXPuls DB недоступна', severity: 'critical', recommendations: DIAG.db },
    { re: /ami.*(?:disconnect|connection.*lost)/i, type: 'ami_disconnected', title: 'Потеряно соединение AMI', severity: 'warning' },
    { re: /migration.*(?:failed|error)/i, type: 'migration_failed', title: 'Ошибка миграции PBXPuls', severity: 'error', recommendations: DIAG.db },
    { re: /freepbx.*(?:api|graphql|rest).*(?:error|failed|timeout)/i, type: 'freepbx_api_error', title: 'Ошибка FreePBX API', severity: 'error' }
  ]
};

function timestamp(text: string): string {
  const iso = text.match(/\b(20\d\d-\d\d-\d\d[T ][0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)\b/)?.[1];
  if (iso) { const parsed = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T')); if (Number.isFinite(parsed)) return new Date(parsed).toISOString(); }
  const syslog = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d\d:\d\d:\d\d)/);
  if (syslog) { const parsed = Date.parse(`${syslog[1]} ${syslog[2]} ${new Date().getFullYear()} ${syslog[3]}`); if (Number.isFinite(parsed)) return new Date(parsed).toISOString(); }
  return new Date().toISOString();
}

function sourceFamily(source: LogSourceDefinition): keyof typeof RULES {
  if (source.parserKey.includes('auth')) return 'auth'; if (source.parserKey.includes('fail2ban')) return 'fail2ban';
  if (source.parserKey.includes('nginx') || source.parserKey.includes('apache') || source.category === 'web') return 'web';
  if (source.category === 'asterisk') return 'asterisk'; if (source.category === 'pbxpuls') return 'pbxpuls'; return 'system';
}

export function parseLogLine(line: string, source: LogSourceDefinition, continuation = ''): NormalizedLogEvent {
  const rawMessage = sanitizeLogText(continuation ? `${line}\n${continuation}` : line, 4000);
  const family = sourceFamily(source); const rule = RULES[family].find(item => item.re.test(rawMessage));
  const severity: LogSeverity = rule?.severity || (/\berror|failed|fatal\b/i.test(rawMessage) ? 'error' : /\bwarn/i.test(rawMessage) ? 'warning' : 'info');
  const eventType = rule?.type || 'unclassified_log'; const title = rule?.title || 'Событие журнала';
  const ip = rawMessage.match(/(?<![\d:])(?:\d{1,3}\.){3}\d{1,3}(?![\d:])/g)?.[0];
  const extension = rawMessage.match(/(?:extension|endpoint|peer|accountid|ext)[=: /"']+([A-Za-z0-9_.-]{1,64})/i)?.[1]||rawMessage.match(/Peer\s+'([^']+)'/i)?.[1];
  const callId = rawMessage.match(/(?:call-id|callid)[=: ]+([^\s,;]+)/i)?.[1];
  const uniqueid = rawMessage.match(/uniqueid[=: ]+([\w.-]+)/i)?.[1]; const linkedid = rawMessage.match(/linkedid[=: ]+([\w.-]+)/i)?.[1];
  const http = rawMessage.match(/"(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([^\s"]+)[^"]*"\s+(\d{3})/i);
  const username = rawMessage.match(/(?:user(?:name)?|invalid user|for)\s*[=: ]+([A-Za-z0-9_.@-]+)/i)?.[1];
  const jail = rawMessage.match(/\[([^\]]+)\].*\b(?:Ban|Unban|Found)\b/i)?.[1];
  const processMatch = rawMessage.match(/\b([A-Za-z0-9_.@/-]+)\[(\d+)\]:/);
  const channel = rawMessage.match(/\b((?:PJSIP|SIP|Local|IAX2|DAHDI)\/[A-Za-z0-9_.@:+-]+(?:-[A-Za-z0-9]+)?)/i)?.[1];
  const dialplanContext = rawMessage.match(/(?:context|@)([A-Za-z0-9_.-]{1,191})/i)?.[1];
  const application = rawMessage.match(/\b(Dial|Queue|Bridge|Hangup|MixMonitor|Playback|AGI)\s*\(/i)?.[1];
  const phone = rawMessage.match(/(?:callerid|from|to|number)[=: /"']+(\+?\d{7,16})\b/i)?.[1];
  const occurredAt = timestamp(rawMessage); const normalized = normalizeFingerprintMessage(rawMessage);
  const fingerprint = buildLogFingerprint([source.sourceKey, eventType, severity, normalized, ip, extension, callId, linkedid, http?.[2], http?.[3], jail]);
  const dedupKey = buildLogFingerprint([source.sourceKey, rawMessage, occurredAt]);
  return { occurredAt, receivedAt: new Date().toISOString(), sourceKey: source.sourceKey, sourceName: source.displayName,
    category: source.category as LogCategory, severity, eventType, title, message: rawMessage.split('\n')[0].slice(0,1000), rawMessage,
    host: os.hostname(), process: processMatch?.[1], pid: processMatch ? Number(processMatch[2]) : undefined, ip, username, extension,
    sipPeer: extension,phone,channel,dialplanContext,application,callId, uniqueid, linkedid, httpMethod: http?.[1]?.toUpperCase(), httpPath: http?.[2], httpStatus: http ? Number(http[3]) : undefined,
    service: family === 'system' ? processMatch?.[1] : undefined, jail, fingerprint, dedupKey, count: 1, firstSeenAt: occurredAt,
    lastSeenAt: occurredAt, parserConfidence: rule ? 0.9 : 0.35, tags: [family, ...(rule?.tags || [])], recommendedActions: rule?.recommendations || [] };
}

export function parseMultilineLog(lines: string[], source: LogSourceDefinition): NormalizedLogEvent[] {
  const events: NormalizedLogEvent[] = []; let pending = '';
  for (const line of lines) {
    if (/^\s+(?:at\s|Caused by:|\.\.\.)/.test(line) && pending) { pending = sanitizeLogText(`${pending}\n${line}`, 4000); continue; }
    if (pending) { events.push(parseLogLine(pending, source)); pending = ''; }
    if (line.trim()) pending = line;
  }
  if (pending) events.push(parseLogLine(pending, source)); return events;
}
