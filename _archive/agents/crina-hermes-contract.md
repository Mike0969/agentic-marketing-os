# Crina Hermes Contract

Crina is the first live-ready agent in the Agentic Marketing OS.

## Endpoint

Set one of:

- `HERMES_AGENT_ENDPOINT` in `.env.local`
- Settings -> Hermes -> Endpoint or account URL

Optional server-only token:

- `HERMES_AGENT_TOKEN`
- `HERMES_AGENT_MODEL` defaults to `gpt-5.5`
- `HERMES_AGENT_TIMEOUT_MS` defaults to `120000`
- `HERMES_AGENT_BACKUP_MODEL` optionally retries chat completions with a second model

## Supported Endpoint Types

### Direct Crina Bridge

A direct bridge endpoint should accept and return the JSON structures below exactly.

### Hermes OpenAI-Compatible API

If `HERMES_AGENT_ENDPOINT` includes `/v1/chat/completions`, the OS sends an OpenAI-compatible chat request:

```json
{
  "model": "gpt-5.5",
  "temperature": 0.4,
  "response_format": { "type": "json_object" },
  "messages": []
}
```

The OS parses `choices[0].message.content` as JSON and then validates it against the same `WeeklyContentPlanOutput` contract.

If Hermes times out or returns invalid JSON, the OS records an `agent_runs` fallback entry and uses deterministic Crina generation so the workflow remains usable.

## Request

The OS sends a `POST` request:

```json
{
  "agent": "Crina",
  "agentId": "agent-crina",
  "workflow": "Generate Weekly Content Plan",
  "expectedOutput": "WeeklyContentPlanOutput JSON with items array. Item status must be idea or brief.",
  "input": {
    "brand": "both",
    "campaignObjective": "string",
    "targetAudience": "string",
    "weekStartDate": "YYYY-MM-DD",
    "platforms": ["LinkedIn", "X", "Instagram", "Facebook", "Blog"],
    "contentIntensity": "normal",
    "humanNotes": "string"
  },
  "context": {
    "brands": [],
    "campaigns": [],
    "constraints": [
      "Never publish automatically.",
      "All content enters the pipeline as Idea or Brief.",
      "Require human approval later."
    ]
  }
}
```

## Response

Hermes should return:

```json
{
  "workflowName": "Generate Weekly Content Plan",
  "generatedBy": "Crina",
  "weekStartDate": "YYYY-MM-DD",
  "summary": "string",
  "items": [
    {
      "id": "uuid-or-string",
      "brand_id": "brand id from context",
      "brandName": "GridFactory.io",
      "campaign_id": "campaign id from context",
      "platform": "LinkedIn",
      "content_type": "LinkedIn post idea",
      "title": "string",
      "hook": "string",
      "body": "string",
      "CTA": "string",
      "assigned_agent": "Content Creator Agent",
      "status": "idea"
    }
  ]
}
```

Valid item statuses are only `idea` or `brief`. The OS validates Hermes output before saving content items.

## Kanban Integration

Crina does not publish. After generation, the user clicks `Create Content Items`; the OS saves items into `content_items`, and the Content Pipeline Kanban renders them under Idea or Brief.

The assigned specialist agent names on generated items are labels until the matching Hermes sub-agents are registered. Missing specialist agents do not block Crina from generating or saving Kanban cards.
