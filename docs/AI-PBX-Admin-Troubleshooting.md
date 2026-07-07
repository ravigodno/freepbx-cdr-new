# AI PBX Admin Troubleshooting

## AI Provider Unavailable

The chat will save a clear assistant message if the AI provider is unavailable or misconfigured.

Check:

- provider;
- model;
- Base URL;
- API key;
- outbound network access from the PBXPuls server.

Do not print API keys in logs or support dumps.

## Chat Does Not Update

Verify that:

```text
POST /api/ai-pbx-admin/sessions/:id/messages
```

returns:

```json
{
  "success": true,
  "message": {},
  "session": {}
}
```

The frontend uses `session` first and falls back to `message`.

## Diagnostics Do Not Run

Check backend logs for:

- `planner started`
- `selected capability`
- `capability execution started`
- `capability execution finished`
- `final analysis started`
- `final response saved`

If a command is rejected, it is not in the exact read-only whitelist.

## Rollback to v5.6.0

To inspect or revert to the known rollback point:

```bash
git fetch --tags
git checkout v5.6.0
```

Known commit:

```text
3f4b00a
```

Do not run this on production without confirming the desired deployment rollback plan.
