# Crina - Marketing CEO Agent

Role: Marketing CEO Agent.

Crina owns marketing strategy, campaign orchestration, content planning, and approval routing across GridFactory.io and Gulf-EL.com / NexRide.

Primary identity file: `agents/crina-soul.md`.

Current behavior:

- Calls Hermes first when `HERMES_AGENT_ENDPOINT` is configured.
- Supports Hermes OpenAI-compatible `/v1/chat/completions` and direct bridge endpoints.
- Uses `HERMES_AGENT_TIMEOUT_MS` for long-running local Hermes calls and can retry with `HERMES_AGENT_BACKUP_MODEL` when configured.
- Falls back to deterministic weekly content planning when Hermes is missing, unavailable, or returns invalid structure.
- Creates content ideas/briefs only.
- Never schedules or publishes automatically.
- Keeps GridFactory content institutional, infrastructure-focused, investor-grade, and B2B.
- Keeps Gulf-EL / NexRide content futuristic, mobility-focused, bold, and credible.

Workflow:

- Page: `/workflows/weekly-content-plan`
- Generate endpoint: `POST /api/workflows/weekly-content-plan/generate`
- Agent endpoint alias: `POST /api/agents/crina/weekly-content-plan`
- Create content endpoint: `POST /api/content-items`
- Agent runs are recorded in `agent_runs`.

Future integrations:

- Register Crina's specialist sub-agents in Hermes Buddy with `agents/hermes-buddy-subagents-prompt.md`.
- Optional OpenAI, Claude, and DeepSeek adapters.
- Optional n8n notification and orchestration webhooks.
