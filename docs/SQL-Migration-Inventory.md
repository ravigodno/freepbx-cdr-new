# SQL Migration Inventory

Date: 2026-07-07

Scope: inventory only. No runtime logic, API contracts, UI, localStorage/sessionStorage keys, FreePBX API, AMI, ARI, CDR access or SQL schema were changed.

## Current PBXPuls SQL State

The project already contains a PBXPuls SQL connection helper in `server.ts`:

- `PBXPULS_DB_HOST`, default `127.0.0.1`
- `PBXPULS_DB_PORT`, default `3306`
- `PBXPULS_DB_USER`, default `pbxpuls`
- `PBXPULS_DB_PASS`, default empty
- `PBXPULS_DB_NAME`, default `pbxpuls`

The local read-only check connected to database `pbxpuls` as user `pbxpuls`. Existing tables:

| Table | Source found | Purpose observed | Duplicate? | Notes |
| --- | --- | --- | --- | --- |
| `schema_migrations` | live DB | Existing schema migration registry | Do not duplicate | Equivalent to requested `pbxpuls_schema_migrations`; migration should either keep it or introduce a compatibility view/alias later. |
| `monitor_settings` | live DB | Monitoring settings key/value | Do not duplicate blindly | Candidate parent for future `pbxpuls_settings`, or keep as module-specific settings. |
| `quality_current` | `server.ts` around `saveQualityCurrentToPBXPulsDb` | Current device/extension quality snapshot | Do not duplicate | Existing write path uses `queryPBXPulsDb`; proposed history tables should complement this table, not replace it. |

Repository setup files currently found:

| File | Current SQL scope |
| --- | --- |
| `setup/asterisk_cdr_schema.sql` | Creates only `asteriskcdrdb.cdr` sample schema. |
| `setup/README.md` | Documents read-only CDR user for `asteriskcdrdb`. |
| `README.md` | Documents `FREEPBX_DB_*`/CDR-style setup, not PBXPuls DB installer flow. |

No repository SQL migration/init file for creating `pbxpuls`, `pbxpuls` user, or the full internal PBXPuls table set was found in this pass.

## Inventory Table

| File | Line / area | What is stored | Current storage | SQL analogue already found | Move to SQL? | Priority | Proposed table | Migration risks | Backward compatibility |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `server.ts` | 52, 3477-4353 | Main local PBXPuls state container | `data/db.json` via `readLocalDb`/`writeLocalDb` | Partial: live `monitor_settings`, `quality_current` only | Yes, by key groups | P0 | Multiple tables below | High blast radius; many APIs depend on current JSON shape | Keep JSON as fallback/read-through during migration. |
| `data/db.json` | top-level `settings` | DB, recordings, AMI, SLA, normalization, import and module settings | JSON object | `monitor_settings` may overlap | Yes | P0 | `pbxpuls_settings` | Secrets and environment overrides must stay masked; do not break existing `.env` precedence | Keep `.env` and JSON fallback until SQL settings are confirmed. |
| `data/db.json` | `users`, `roles` | App users and roles | JSON arrays | None | Yes | P0 | `pbxpuls_users`, `pbxpuls_roles`, `pbxpuls_user_roles`, `pbxpuls_permissions` | Auth break risk; password/token handling | Dual-read with JSON fallback; migrate passwords/secrets without logging. |
| `server.ts` | 6328-8027 area | Directory contacts and directory column settings | `data/db.json` keys `directory`, `directoryColumnSettings` | None | Yes | P0 | `pbxpuls_directory_contacts`, `pbxpuls_directory_groups`, `pbxpuls_table_views` | Contact dedupe and import behavior | Preserve existing API responses and column defaults. |
| `server.ts` | 8230-9368 area | Contact sync accounts, mappings, OAuth/CardDAV states | `data/db.json` keys `contactSyncAccounts`, `contactSyncMappings`, `yandexOAuthStates` | None | Yes | P1 | `pbxpuls_settings`, `pbxpuls_directory_imports` | Encrypted credentials and OAuth state expiry | Keep encrypted payload format and old JSON fallback. |
| `server.ts` | 9822-10257 area | Marketing/calltracking config and events | `data/db.json` keys `calltrackingSites`, `calltrackingPhoneNumbers`, `calltrackingReplacementRules`, `calltrackingSessions`, `calltrackingEvents`, `calltrackingMatches`, `marketingDailyAggregates`, `marketingAggregateStatus`, `yandexMetrikaIntegrations` | None | Yes | P1 | `pbxpuls_settings`, `pbxpuls_api_logs`, `pbxpuls_system_events`, future calltracking tables | Event volume and privacy; visitor identifiers | Keep public script contract and avoid CDR table mixing. |
| `public/calltracking.js` | 55-149 | Browser visitor session id, UTM and first referrer | site visitor localStorage/sessionStorage | None | Partly | P2 | server-side calltracking tables, not app user preferences | This is client attribution state, not admin UI state | Do not remove browser storage; sync only collected server events. |
| `server/aiPbxAdmin.ts` | 555-1157 | AI PBX Admin settings, sessions, messages, knowledge | `data/db.json` keys `ai_pbx_settings`, `ai_pbx_sessions`, `ai_pbx_knowledge` | None | Yes | P0 | `pbxpuls_ai_providers`, `pbxpuls_ai_agents`, `pbxpuls_ai_prompts`, `pbxpuls_ai_sessions`, `pbxpuls_ai_messages`, `pbxpuls_ai_knowledge_base` | API keys and provider errors must never leak | Preserve `{ success, message, session }` API contract and JSON fallback. |
| `data/db.json` | `aiAssistants`, `aiDialogs`, `aiKnowledgeSources`, `aiAssistantRoutes` | General AI assistant config and dialog history | JSON arrays | None | Yes | P1 | `pbxpuls_ai_agents`, `pbxpuls_ai_sessions`, `pbxpuls_ai_messages`, `pbxpuls_ai_voice_routes`, `pbxpuls_ai_knowledge_base` | Different AI module shapes may overlap | Normalize with module discriminator, keep old keys. |
| `data/db.json` | `callScripts`, `callScriptVersions`, `callScriptAssignments`, `callScriptRuns`, `callScriptRunSteps` | Call scripts, versions, assignments and run history | JSON arrays | None | Yes | P1 | `pbxpuls_call_scripts`, `pbxpuls_call_script_steps`, plus run/history tables | Versioning and referential integrity | Backfill IDs and keep JSON export compatibility. |
| `server-management.ts` | 14, 3159, 4892-4908 | Management audit/change log | `data/management-change-log.json` | None | Yes | P0 | `pbxpuls_audit_log`, `pbxpuls_system_events` | Audit log must be append-only and mask secrets | Append to SQL first, keep file fallback during transition. |
| `server-management.ts` | 15, 1681 | Management previews | `data/management-previews.json` | None | Yes | P1 | `pbxpuls_test_runs`, `pbxpuls_test_results` or module preview table | Preview payloads can be large and contain masked config | Retain file-based preview IDs until migration is stable. |
| `server-management.ts` | 16, 80 | Extension UI settings | `data/management-extension-ui-settings.json` | None | Yes | P1 | `pbxpuls_user_preferences`, `pbxpuls_table_views` | Per-user/global distinction may be unclear | Default to current global behavior; add user scope later. |
| `server-management.ts` | 17, 3184-3224 | Trunk templates | `data/trunk-templates.json` | None | Maybe | P2 | `pbxpuls_tools` or module template table | Operator template files are also versioned in Git | Keep Git templates as source; SQL only for local/customer templates. |
| `server-management.ts` | 18, 3236-3276 | Extension templates | `data/extension-templates.json` | None | Yes | P1 | `pbxpuls_tools` or extension template table | Template compatibility with management APIs | Keep JSON import/export. |
| `server-management.ts` | 12-13, 3288-3414 | Numbering capacity records and metadata | `data/numbering-capacity*.json` | None | Yes | P1 | `pbxpuls_tools`, `pbxpuls_settings`, future numbering tables | May depend on FreePBX ranges not yet formalized | Read JSON first until schema lands. |
| `server.ts` | 12333-12353 | Health check history | `data/health-history.json` | None | Yes | P2 | `pbxpuls_system_events`, `pbxpuls_test_runs` | High churn if polled frequently | Retain rolling retention limit. |
| `server.ts` | 13721-14260 | Quality telemetry history and alerts | `data/quality-history.json`, `data/quality-alerts.json` | Partial: `quality_current` | Yes | P0/P1 | `pbxpuls_extension_status_history`, `pbxpuls_trunk_status_history`, `pbxpuls_system_events` | Volume and retention; avoid duplicating `quality_current` | Keep `quality_current` as current snapshot, add history tables. |
| `server.ts` | 14350-15822 | Devices map, history, alerts, conflicts | `data/devices-*.json` | Partial: `quality_current` | Yes | P1 | `pbxpuls_extension_status_history`, `pbxpuls_system_events` | Derived vs source data boundary | Rebuild derived map if SQL unavailable. |
| `server.ts` | 74-95 | DTMF events | `data/dtmfEvents.json` | None | Yes | P2 | `pbxpuls_system_events` or dedicated DTMF table | Potential sensitive call metadata | Retention and masking policy required. |
| `server.ts` | 12814-12841 | Live snapshot exports | generated JSON files | None | No / optional | P3 | none, optional `pbxpuls_system_events` metadata only | Export files are user artifacts | Keep file download behavior unchanged. |
| `src/App.tsx` | 534, 2324, 2481 | Auth session cache | `localStorage.asterisk_cdr_session` | Future `pbxpuls_users` only server-side | No direct migration | P0 guard | none | Removing it would break login UX | Keep localStorage; SQL only stores server user/role data. |
| `src/App.tsx` | 680-765 | Theme, active view, monitor mode, sidebar expanded | localStorage | None | Yes | P2 | `pbxpuls_user_preferences` | Must not break anonymous/pre-login behavior | Keep localStorage primary until user preference API exists. |
| `src/App.tsx` | 1781-1809 | Operator extension for Click2Call | `localStorage.operator_asterisk_ext` | None | Yes | P1 | `pbxpuls_user_preferences` | Wrong extension affects calls | Keep localStorage fallback and validate against user profile later. |
| `src/App.tsx` | 1786, 5075 | Live call banner position | `localStorage.pbxpuls_live_call_banner_pos` | None | Yes | P3 | `pbxpuls_user_preferences` | Low risk, UI-only | Keep browser preference fallback. |
| `src/components/monitoring/DbExplorerTab.tsx` | 108, 320, 330 | Custom SQL templates | `localStorage.pbxpuls_db_custom_templates` | None | Yes | P2 | `pbxpuls_saved_filters`, `pbxpuls_tools` | SQL templates may contain sensitive queries | Keep local-only until sharing/audit model exists. |
| `src/modules/monitoring/tabs/monitoring/DbExplorerTab.tsx` | 238, 363, 1635 | SQL console history | `localStorage.pbx_sql_console_history` | None | Maybe | P3 | `pbxpuls_user_preferences` or audit table | Could store sensitive SQL | Prefer opt-in migration or local-only retention. |
| `src/modules/monitoring/tabs/monitoring/CommandCenterTab.tsx` | 271-325 | Command center favorites and history | localStorage `pbx_center_favs`, `pbx_center_history` | None | Yes | P2 | `pbxpuls_user_preferences`, `pbxpuls_audit_log` | Commands/history may reveal system details | Keep local history unless explicitly shared/audited. |
| `src/modules/management/ProvisioningCenter.tsx` | 213-220, 306, 808 | Management active tabs/workspace tab | localStorage `pbxpuls.management.activeTab`, `pbxpuls.extensions.workspaceTab` | None | Yes | P3 | `pbxpuls_user_preferences` | UI-only | Keep browser fallback. |
| `src/modules/management/trunkLab/TrunkLabView.tsx` | 22, 51 | Trunk Lab test history | `localStorage.pbxpuls.trunkLab.testHistory` | None | Yes | P1 | `pbxpuls_test_runs`, `pbxpuls_test_results` | Test payloads may contain trunk details/secrets | Store masked results only; keep local history fallback. |
| `src/components/reports/dashboard/LinesDashboard.tsx` | 46, 56 | Calltracking dashboard channels | localStorage `pbx_calltracking_channels` | None | Yes | P2 | `pbxpuls_user_preferences`, calltracking settings table | User vs global setting distinction | Keep local fallback. |
| `src/modules/monitoring/tabs/monitoring/SngrepTab.tsx` | 160-171 | Sngrep tab theme | `localStorage.pbxpuls_sngrep_tab_theme` | None | Yes | P3 | `pbxpuls_user_preferences` | UI-only | Keep local fallback. |
| `src/components/AIPBXAdminTab.tsx` | 223-225 | Token fallback names | localStorage token keys | Future auth tables only server-side | No direct migration | P0 guard | none | Do not remove token fallbacks in SQL migration. |
| `server.ts` | 10385-10409 | Demo CDR data lifecycle | in-memory `mockCDRData`, demo mode setting | None | No | P3 | none | Demo-only data should not pollute production SQL | Leave in memory unless demo persistence is required. |

## Requested Table Checklist

| Requested table | Existing analogue found | Recommendation |
| --- | --- | --- |
| `pbxpuls_schema_migrations` | `schema_migrations` | Do not duplicate blindly; decide naming compatibility in migration phase. |
| `pbxpuls_settings` | `monitor_settings` partial | Add or map after deciding global vs module settings. |
| `pbxpuls_users` | none | Add. |
| `pbxpuls_roles` | `data/db.json.roles` only | Add. |
| `pbxpuls_user_roles` | none | Add. |
| `pbxpuls_permissions` | role payloads in JSON | Add. |
| `pbxpuls_tools` | JSON/templates/localStorage | Add as registry only if needed; do not store all payloads generically. |
| `pbxpuls_user_preferences` | localStorage only | Add. |
| `pbxpuls_saved_filters` | localStorage/React state | Add. |
| `pbxpuls_table_views` | `directoryColumnSettings`, UI prefs | Add. |
| `pbxpuls_audit_log` | `management-change-log.json` | Add. |
| `pbxpuls_system_events` | health/quality/device alerts | Add. |
| `pbxpuls_api_logs` | none durable | Add later with retention. |
| `pbxpuls_test_runs` | Trunk Lab localStorage/previews | Add. |
| `pbxpuls_test_results` | Trunk Lab/previews/quality files | Add. |
| `pbxpuls_trunk_status_history` | none durable | Add; do not confuse with FreePBX trunk config. |
| `pbxpuls_extension_status_history` | `quality_current` current snapshot only | Add history table; keep `quality_current`. |
| `pbxpuls_directory_contacts` | `data/db.json.directory` | Add. |
| `pbxpuls_directory_groups` | directory group field only | Add if groups become first-class. |
| `pbxpuls_directory_imports` | contact sync/import JSON | Add. |
| `pbxpuls_call_scripts` | `data/db.json.callScripts` | Add. |
| `pbxpuls_call_script_steps` | `callScriptVersions`/steps | Add. |
| `pbxpuls_ai_providers` | `ai_pbx_settings` | Add. |
| `pbxpuls_ai_agents` | AI assistant JSON | Add. |
| `pbxpuls_ai_prompts` | AI settings/prompts JSON | Add. |
| `pbxpuls_ai_sessions` | `ai_pbx_sessions`, `aiDialogs` | Add. |
| `pbxpuls_ai_messages` | session message arrays | Add. |
| `pbxpuls_ai_voice_routes` | `aiAssistantRoutes` | Add. |
| `pbxpuls_ai_knowledge_base` | `ai_pbx_knowledge`, `aiKnowledgeSources` | Add. |

## First Migration Candidates

P0 candidates:

- `settings`
- `users`, `roles`, permissions
- directory contacts and table views
- AI PBX Admin sessions/messages/settings/knowledge
- management audit log
- `quality_current` compatibility plus quality/status history

P1 candidates:

- Trunk Lab test runs/results
- call scripts
- contact import/sync accounts and imports
- extension templates and numbering capacity
- marketing/calltracking configuration and collected events

P2/P3 candidates:

- UI preferences and saved filters
- SQL console and command center histories
- low-risk theme/sidebar/banner preferences
- generated exports and demo-only data should remain file/in-memory unless a product requirement appears.
