# PBXPULS_KNOWLEDGE_BASE

## Persistent data policy

- MariaDB is the only source of truth for PBXPuls runtime and business data.
- PBXPuls does not introduce or maintain mutable file-backed runtime stores.
- `data/db.json` and other mutable JSON stores are legacy technical debt, not an accepted architecture.
- Every remaining legacy reader and writer must be migrated to PBXPuls-owned MariaDB tables.
- A release must preserve database contents and verify critical record counts before and after deployment.
- FreePBX data is still accessed through verified REST or AMI interfaces first; direct FreePBX database access remains a documented fallback.

## Bitrix Pull resilience

- The connector must advance its cursor past malformed historical form results and report the skipped count.
- PBXPuls must reject Pull pages without an `items` array and a numeric `nextCursor`.
- A call drill-down opened from a site-form lead must return the linked lead row as well as the CDR row.

## Проверенные особенности

### FreePBX REST

-   /extensions -\> 404 на текущей системе.
-   /core/users -\> основной источник extension/name.
-   /userman/extensions -\> только username/usermanId.

### GraphQL

Использовать существующие запросы из: /opt/freepbx-api-dashboard

### Bulk Handler

Эталон структуры данных для Extensions.

### OAuth

client_credentials application/x-www-form-urlencoded

### Правила

-   Не использовать description как имя.
-   Не использовать id как extension.
-   Secrets всегда маскировать.

## Разработка

Перед добавлением новой логики: 1. Проверить существующий код. 2.
Проверить freepbx-api-dashboard. 3. Проверить
FREEPBX_API_REFERENCE_FULL.md.
# Remote phonebook gateway

- SIP phonebooks are generated from PBXPuls directory data, not from an invented
  FreePBX endpoint.
- Grandstream and Yealink profiles have different XML URLs and independent
  credentials.
- A shared profile must never include private contacts. A `personal_combined`
  profile may include only the selected owner's private contacts.
- Phonebook credentials must be copied when created or rotated; plaintext secrets
  are not stored.
- Production phonebook URLs require HTTPS because SIP phones use HTTP Basic
  authentication.
- For controlled LAN deployments PBXPuls provides a phonebook-only listener on
  port `3001`. It automatically allows directly connected IPv4 subnets and never
  exposes the UI or `/api`.
- If port `3001` is already occupied by an existing Apache/Nginx phonebook proxy,
  PBXPuls keeps running and leaves that listener in place.

# Notification center

- Modules emit channel-independent events; they must not call Telegram transports.
- Rules, transition state, immutable events and delivery outbox are separate SQL entities. Filtered, cooldown and duplicate outcomes remain visible in the delivery journal.
- Missed calls are evaluated only after the configured delay (15 minutes by default) and are suppressed when a later answered outbound CDR exists for the normalized external number. Producer cursors avoid restart duplicates and historical alert floods.
- Trunk problems require consecutive failed observations; recovery is emitted once after a successful observation.
- DB outage occurrence is retained in memory while SQL is unavailable and written after recovery, because an SQL outbox cannot be updated during the outage itself.
- Bot tokens are encrypted with an environment-derived installation key. APIs expose `hasToken`, never token fragments or plaintext.
- Telegram Chat ID is a signed integer and is not restricted to the `-100` group prefix.
- Bitrix24 is a separate outbox channel. It sends through `im.message.add` to a numeric employee ID or `chat{id}`, stores the incoming webhook only in encrypted channel configuration, and never exposes the saved URL through settings APIs.
- Bitrix24 webhook calls require HTTPS, reject credentials/query fragments and private DNS targets, disable redirects, and use the same bounded retry and delivery journal contract as Telegram.
- Package minutes, generic Asterisk/AMI health, disk and security events remain catalog-only until a reliable producer is explicitly connected.

# Live call popup and desktop alert contract

The built-in PBXPuls popup and the Desktop Alerts extension must use the same normalized live-call payload. UI components must not independently infer the caller from arbitrary AMI rows.

## Incoming calls

- `Кто звонит` is always the calling party, never the current operator, DID, trunk, queue, ring group or an unanswered group member.
- For an external incoming call, the authoritative caller is the external number received on the inbound trunk. The displayed name, company, position and directory fields must all be resolved again from that final number; identity fields from a previously selected AMI branch must not be preserved.
- For an internal incoming call, the caller is the source extension and its directory identity.
- `Куда звонит` shows the logical destination before answer: direct extension, queue or ring group number.
- After answer, `Куда звонит` shows the extension that actually answered. Ringing or cancelled parallel members must never be shown as the answered extension.

## Outgoing calls

- `Кто звонит` is the internal extension that initiated the call. `Куда звонит` is the external number dialed by that extension.
- The first confirmed outgoing identity is stable for the lifetime of `operatorExt + linkedid`. Answer-time trunk legs must not replace the internal caller or external destination.
- Short technical route values such as a trunk suffix or `Exten=300` are not participants and must never be shown as an extension unless independently confirmed as a real internal endpoint.
- The built-in popup, browser alerts and Desktop Alerts extension consume the same stabilized backend payload.

## Ring groups

- FreePBX may assign different `Linkedid` values to the inbound trunk leg and each parallel member leg. They still form one logical incoming call when the trunk `Dial` targets the member and the member leg has the same ring-group destination in the same time window.
- PBXPuls must correlate those legs before direction detection, ranking and contact resolution.
- Confirmed inbound-trunk evidence has priority over internal-looking member legs. Outgoing evidence is evaluated first so trunks whose names contain `-in-` do not turn real outgoing calls into incoming calls.
- While group `9999` is ringing, the expected mapping is `Кто звонит = external caller`, `Куда звонит = 9999`.
- When a member answers, the expected mapping is `Кто звонит = external caller`, `Куда звонит = answered extension`.

## Regression protection

- Changes to live-call grouping, direction detection, ranking or caller identity must run `test:live-popup-parallel-external`, `test:live-popup-route-summary`, `test:live-popup-priority` and `test:inbound-caller`.
- The external parallel-call fixture must retain separate `Linkedid` values for the trunk and member branch; using one shared `Linkedid` does not reproduce production FreePBX behavior.

## Live incoming blacklist action

- The popup blacklist-and-hangup action is enabled only for an active external incoming call.
- The backend resolves the caller and channel group again from the authenticated operator and current AMI snapshot; client-provided phone numbers and channel names are never trusted.
- Apply requires a short-lived preview, persists the blacklist flag in PBXPuls MariaDB, synchronizes the normalized number to Asterisk AstDB and then requests hangup only for channels in the resolved logical call.
