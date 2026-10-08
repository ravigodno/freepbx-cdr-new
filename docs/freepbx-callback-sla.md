# Callback SLA and FreePBX schedules

Callback duration comes from PBXPuls settings. Working intervals come from the
exact DID/CID inbound route and its Time Conditions / Time Groups. Configuration
is read afresh for each request through the existing readonly FreePBX SQL
provider: the installed legacy REST module exposes state, not Time Group rules.
No FreePBX configuration or telephony service is modified.

The resolver follows both branches through greetings and nested conditions.
Only unambiguous destinations with the same employee/group membership are
assigned automatically. A terminal Hangup contributes no working interval;
the employee destination of the alternative working branch owns overnight calls.
Unselected IVRs and unsupported calendars are not guessed.

Time Group ranges use Asterisk's inclusive final minute, named weekdays/months,
date restrictions and the condition timezone (PBX timezone for `default`).
SLA counts only working milliseconds, including overnight carry-over, breaks
and weekends. The common PBXPuls working interval is the fallback for routes
without Time Conditions. Status names remain unchanged.

Current manual overrides are checked readonly with the existing Asterisk CLI
helper (15-second cache). An active override, unavailable state, unsupported or
ambiguous schedule suspends automatic SLA penalties and marks schedule unknown.
Processed calls then have a neutral badge and do not count as successful or
late SLA. This does not reconstruct historical overrides: FreePBX current
configuration contains no historical opening/closing journal. Historical calls
are recalculated using current routing and schedules, as requested.

Regression checks: `npm run test:freepbx-working-sla`,
`npm run test:missed-route-responsibility`, `npm run test:cdr-sla-status`.
