# Operator Templates

Operator Templates are the v5.1.0 foundation for a Git-backed library of
operator trunk settings for FreePBX/Asterisk.

The goal is to reduce trial-and-error trunk setup. Instead of searching forums,
an administrator can inspect baseline chan_sip and PJSIP templates, compare
settings, and prepare a migration preview.

## Git Templates

Git Templates live in `templates/operators/` and ship with PBXPuls. They are
updated through normal repository updates and are the source of truth for the
shipped template library.

Git Templates may contain:

- SIP/PJSIP parameters;
- public SIP server names and ports;
- transport, registration and authentication modes;
- context, codecs, DTMF and NAT settings;
- number format notes;
- diagnostics hints;
- tested FreePBX/Asterisk version notes.

Git Templates must not contain:

- passwords, SIP secrets, tokens or client secrets;
- real customer logins when they are personal;
- contract numbers;
- personal data;
- private customer IP addresses.

Secrets are entered only locally on a specific PBX. Any `password`, `secret`,
`token` or `clientSecret` value must be rejected, omitted or masked.

## Local Working Configs

Local Working Configs are planned for a later release. They will represent a
specific PBX installation and may contain local values. They must not be stored
in Git and must follow explicit secret-handling rules.

## Why Keep chan_sip

chan_sip is deprecated, but many production PBX systems still have legacy
trunks. PBXPuls keeps chan_sip templates to help inspect existing settings and
prepare migration to PJSIP.

For new Trunks, PJSIP is preferred.

## Migration Preview

The v5.1.0 UI includes a local-only preview for chan_sip to PJSIP migration.
It does not read real trunks, does not call FreePBX, and does not create or
modify trunks.

Automatically mapped examples:

- `host` to `sipServer`;
- `port` to `sipServerPort`;
- `username` to `username`;
- `authUser` to `authUsername`;
- `fromUser` to `fromUser`;
- `fromDomain` to `fromDomain`;
- `context` to `context`;
- `qualify=yes` to `qualifyFrequency=60`;
- `canreinvite=no` to `directMedia=no`;
- `nat=force_rport,comedia` to `forceRport=yes` and `rtpSymmetric=yes`;
- `dtmfmode=rfc2833` to `dtmfMode=rfc4733`;
- `allow=alaw&ulaw` to `codecs=["alaw","ulaw"]`.

Manual review is required for:

- `insecure=port,invite`;
- `match`/identify for inbound INVITE;
- `from_user` and `from_domain` requirements;
- NAT behavior on the real network;
- Caller ID and number formats;
- any credential-related field.

If the parser sees `secret=` or `password=`, it masks the value and does not
display the original.

## Future Trunk Lab

Trunk Lab will be implemented later. It will use Git Templates as safe input for
diagnostics and test planning. The current release intentionally does not create
test trunks, register trunks, run calls, call BMO, call FreePBX REST apply
endpoints, or run `fwconsole reload`.

## Management Dashboard

The Management Dashboard is intentionally deferred until final stages, after
real modules provide stable data.
