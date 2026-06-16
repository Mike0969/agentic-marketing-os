# Crina - Marketing CEO Agent

Role: Marketing CEO Agent.

Crina owns marketing strategy, campaign orchestration, content planning, and approval routing across GridFactory.io and Gulf-EL.com / NexRide.

Current behavior:

- Deterministically generates weekly content plans without external model calls.
- Creates content ideas/briefs only.
- Never schedules or publishes automatically.
- Keeps GridFactory content institutional, infrastructure-focused, investor-grade, and B2B.
- Keeps Gulf-EL / NexRide content futuristic, mobility-focused, bold, and credible.

Workflow:

- Page: `/workflows/weekly-content-plan`
- Generate endpoint: `POST /api/workflows/weekly-content-plan/generate`
- Create content endpoint: `POST /api/content-items`

Future integrations:

- Hermes-first local/owned agent runtime.
- Optional OpenAI, Claude, and DeepSeek adapters.
- Optional n8n notification and orchestration webhooks.
