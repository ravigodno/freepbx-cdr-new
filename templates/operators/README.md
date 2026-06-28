# PBXPuls Operator Templates

This directory contains shipped Git Templates for operator trunk settings.
The source of truth for these templates is the Git repository.

Git Templates are generic and anonymized. They are updated with PBXPuls code
and must not contain customer-specific values.

Allowed data:

- public SIP/PJSIP server names and ports;
- transport, registration and authentication modes;
- context, codecs, DTMF and NAT settings;
- public number format notes;
- diagnostics hints;
- tested FreePBX and Asterisk versions;
- implementation notes.

Forbidden data:

- passwords, secrets, tokens and client secrets;
- real customer logins when they are personal;
- contract numbers;
- personal data;
- private customer IP addresses;
- any credential-like value.

Use `secretPlaceholder` or `passwordPlaceholder` instead of real secrets.

## Template Status

- `draft`: baseline template, not confirmed on a real PBX.
- `tested`: tested in a known environment, but may still need local checks.
- `verified`: repeatedly confirmed and reviewed.
- `deprecated`: kept for migration or historical compatibility.

## Local Working Configs

Local Working Configs will be implemented later. They may contain values for a
specific PBX installation and must not be committed to Git. Secrets are entered
locally on the target PBX only.

## Future Trunk Lab

Future Trunk Lab will use these templates as safe starting points for comparing
chan_sip and PJSIP settings, preparing migration previews, and running
diagnostics. This foundation does not create trunks, call FreePBX, register a
trunk, or run test calls.
