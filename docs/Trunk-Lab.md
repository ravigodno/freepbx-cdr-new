# Trunk Lab

Trunk Lab is the PBXPuls v5.2.0 read-only diagnostics module for SIP/PJSIP
Trunks.

It reads the FreePBX DB table `asterisk.trunks` as the primary inventory of real Trunks. Asterisk CLI output is used only as runtime enrichment for registration, peer, endpoint, contact, RTT, warnings and recommendations. It does not create, update or delete Trunks.

## Read-only Scope

v5.2.0 is intentionally read-only. Trunk Lab does not:

- create Trunks;
- modify Trunks;
- delete Trunks;
- apply Operator Templates;
- call FreePBX REST apply endpoints;
- call BMO for writes;
- run `fwconsole reload`;
- run test calls;
- change routes or Extensions;
- save passwords or Local Working Configs.

## Backend Operation

Trunk Lab uses the existing Management operation endpoint:

- `POST /api/management/trunks/preview`
- `operationType: "trunk_lab_diagnostics"`

This is a read-only preview/result operation. It first loads real Trunks with:

`SELECT trunkid, name, tech, channelid, outcid, disabled FROM asterisk.trunks ORDER BY trunkid`

Then it uses short-lived AMI `Action: Command` reads only to enrich those DB Trunks. It does not have an Apply step.

## Inventory and Enrichment

FreePBX DB is the source of truth for the Trunk list. Only rows from `asterisk.trunks` can become `TrunkDiagnostic` table rows.

Mapping:

- FreePBX `tech = sip` becomes PBXPuls `technology = chan_sip`;
- FreePBX `tech = pjsip` becomes PBXPuls `technology = pjsip`;
- any other value becomes `technology = unknown`.

CLI-only peers, endpoints, registrations, AMI errors and timeouts never create Trunk rows. They are source status or enrichment data only.

## Asterisk CLI Commands

PJSIP:

- `pjsip show registrations`
- `pjsip show endpoints`
- `pjsip show contacts`
- `pjsip show auths`
- `pjsip show aors`

chan_sip:

- `sip show registry`
- `sip show peers`
- `sip show users`
- `sip show settings`

If a command is unavailable, Trunk Lab reports it as unavailable instead of
showing a stack trace.

## Normalized Statuses

Registration:

- `registered`
- `rejected`
- `auth_failed`
- `timeout`
- `no_registration`
- `unavailable`
- `unknown`

Endpoint/Peer:

- `available`
- `unavailable`
- `not_in_use`
- `unreachable`
- `unknown`

Contact:

- `reachable`
- `nonqual`
- `unreachable`
- `no_contact`
- `unknown`

Risk:

- `ok`
- `warning`
- `critical`
- `unknown`

## Interpretation Rules

PJSIP `Rejected` or `403` means registration was rejected by the operator.
Recommendations include checking username/auth username, password, from_user,
from_domain and allowed source IP.

PJSIP `NonQual` means the contact does not answer qualify. Recommendations
include checking OPTIONS behavior, transport, firewall, NAT and operator qualify
support.

PJSIP endpoint unavailable or missing contacts usually points to registration,
AOR, transport, SIP server or NAT/firewall problems.

chan_sip `Rejected` points to username, secret, fromuser/fromdomain or host.
`Unreachable` points to qualify, OPTIONS, firewall/NAT or host reachability.
`Unmonitored` means qualify is off, so PBXPuls cannot verify peer reachability.
`Lagged` means the peer answers slowly.

## Secret Masking

Backend masks command output inside the Management preview operation before sending it to the frontend. Masked keys:

- `secret`
- `password`
- `passwd`
- `token`
- `client_secret`
- `auth_password`

Masked values are returned as `********`.

## Operator Templates Link

Trunk Lab can show a possible Operator Template when a trunk name resembles a
known operator. The suggestion is read-only. PBXPuls does not apply templates in
v5.2.0.

## Future Work

Planned later stages:

- test trunk;
- test registration;
- test outbound call;
- save Local Working Config;
- apply template through a preview/apply workflow.

## DB Inventory vs CLI Objects

Trunk Lab no longer guesses Trunks from CLI-only data. It creates diagnostic rows only from FreePBX DB `trunks` records.

chan_sip enrichment uses the DB `channelid` to find a peer from `sip show peers`:

- raw peer name before `/` equals `channelid`;
- full peer name starts with `channelid + "/"`;
- full peer name equals `channelid`.

For example DB trunk `name=74990000002`, `tech=sip`, `channelid=841282-in` matches CLI peer `841282-in/841282`. The username after `/` can then be matched with `sip show registry` username `841282`.

PJSIP enrichment uses the DB `channelid` as endpoint/registration/contact identity. A CLI endpoint such as `299/299` is ignored when there is no matching row in FreePBX DB `trunks`.

Source-level AMI/CLI/DB errors, timeouts and unavailable commands are reported in the separate `sourceStatus` block. They must not create fake Trunk rows such as AMI, CLI, timeout, unknown, unavailable, error, failed, command or response.


## v5.3.0 Trunk Lab Testing

Trunk Lab Testing adds three Management preview operations: `trunk_lab_registration_test`, `trunk_lab_peer_test` and `trunk_lab_outbound_call_test`. Diagnostics still use FreePBX DB `asterisk.trunks` as primary inventory. Registration and Peer/Contact tests are read-only CLI checks. Outbound call test is a controlled AMI Originate operation and runs only after explicit user confirmation.

The outbound call test does not create Trunks, does not change routes, does not change dialplan and does not run `fwconsole reload`. It uses current FreePBX Outbound Routes. Forced Trunk selection is intentionally deferred to a later stage. The call can be billed by the operator.

Test history in v5.3.0 is frontend-side only and may be stored in `localStorage`; secrets are not stored. Errors such as 403, 404, 408, 480, 486, 488 and 503 are interpreted as recommendations around CID, number format, NAT/firewall, codecs, registration and operator availability.
