# AI PBX Admin

AI PBX Admin is the PBXPuls chat interface for engineering diagnostics of FreePBX/Asterisk.

The active chat endpoint is:

```text
POST /api/ai-pbx-admin/sessions/:id/messages
```

The response must include:

```json
{
  "success": true,
  "message": {},
  "session": {}
}
```

## Architecture

The chat flow is:

1. User writes a natural-language task in Russian.
2. AI planner selects a high-level capability.
3. PBXPuls backend validates the capability.
4. PBXPuls backend collects read-only diagnostics.
5. Diagnostic output is masked and sent back to AI.
6. AI writes an engineering conclusion in Russian.
7. Backend saves the assistant message and returns the updated session.

## Preserved Features

- AI provider settings.
- Model, Base URL and API key storage.
- Chat sessions.
- Message history.
- Message normalization for `text/content` and dates.
- Frontend chat update from `message/session` without page refresh.

## Capability vs Command

A capability is an intent such as `diagnose_trunk` or `diagnose_rtp`.

A shell command is an implementation detail owned by PBXPuls backend.

The AI model must never choose shell commands directly. It only chooses a capability. PBXPuls Agent Core decides which read-only commands are needed for that capability.
