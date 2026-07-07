# AI PBX Admin Security

AI PBX Admin is read-only in the current implementation.

## Allowed Pattern

- AI selects a capability.
- Backend checks that capability is known.
- Backend executes only predefined read-only diagnostics.
- Commands are executed with `execFile`, not `exec(command)`.
- Output is masked before AI analysis and UI response.

## Forbidden Actions

- `rm`
- `reboot`
- `shutdown`
- `fwconsole reload`
- `fwconsole restart`
- `systemctl stop/restart`
- `service restart`
- SQL `delete/update/drop`
- firewall or iptables changes
- config writes
- sed/perl modifications against production configs
- FreePBX write APIs

## Secrets

Never log or return:

- AI API keys
- OAuth/JWT tokens
- AMI credentials
- SIP/PJSIP secrets
- passwords
- long Base64-like secret blobs

## Legacy Diagnostics Endpoint

`POST /api/ai-pbx-admin/diagnostics/collect-safe` is restricted to exact read-only whitelist entries. It must not accept arbitrary shell strings or prefix-based checks.
