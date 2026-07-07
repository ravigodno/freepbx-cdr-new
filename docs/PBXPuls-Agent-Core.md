# PBXPuls Agent Core

PBXPuls Agent Core is the backend layer between the AI model and the PBX.

## Files

- `server/aiAgentPrompts.ts` contains planner and analyzer prompts.
- `server/aiAgentPlanner.ts` asks the AI model for a capability.
- `server/aiAgentCapabilities.ts` maps capabilities to read-only diagnostics.
- `server/aiAgentCore.ts` orchestrates planner, capability execution and final analysis.

## Current Capabilities

- `diagnose_trunk`
- `diagnose_extension`
- `diagnose_rtp`
- `diagnose_calls`
- `diagnose_network`
- `diagnose_ami`
- `answer_only`

## Flow

```text
user task
  -> planner
  -> capability
  -> backend read-only diagnostics
  -> analyzer
  -> saved assistant message
```

## Adding a Capability

1. Add the capability id to `AiAgentCapabilityId`.
2. Add it to `AI_AGENT_CAPABILITIES`.
3. Document it in `buildPlannerPrompt`.
4. Add read-only command specs in `getCapabilityCommands`.
5. Keep execution through `execFile`.
6. Mask sensitive output before returning it to AI or UI.

Do not add direct user-controlled shell execution.
