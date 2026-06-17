# Hermes automation — daily team run, Slack report, Telegram alerts

This is the Hermes-side wiring that drives the dashboard's parallel team run.
The **schedule, memory, Slack send, and Telegram alerts live in Hermes** — the
dashboard only exposes the run + report as data/outputs:

- `POST /api/agents/team/run` — fan out the specialists, synthesize a report, return it.
- `GET  /api/agents/team/report` — fetch the latest report (for Slack).

Both accept either an admin browser session **or** a bearer token equal to
`AGENT_TRIGGER_TOKEN` (set in `.env.local`). Hermes uses the token.

> Division of labor you asked for:
> **Slack = the full report.** **Telegram = announcements only** (problems,
> follow-ups, approvals). Live posting stays disabled everywhere.

Replace placeholders before pasting:
- `DASHBOARD_URL` → e.g. `http://127.0.0.1:3000`
- `AGENT_TRIGGER_TOKEN` → the value from `.env.local`

---

## 1. Store the list + builder in Hermes memory (paste in the Telegram chat)

**Competitor / target list:**

```
Lock in memory my Agentic Marketing OS target list: GridFactory.io, Gulf-EL/NexRide, plus competitors ClickUp-equivalents in our space. Remember this. When I say "go", run the daily marketing team job. The editable source of truth for targets is the dashboard at DASHBOARD_URL/agent-brain (Targets list). Do not publish anything.
```

**Builder / report instructions:**

```
Lock in memory the Agentic Marketing OS builder instructions: To run the daily job, call POST DASHBOARD_URL/api/agents/team/run with header "Authorization: Bearer AGENT_TRIGGER_TOKEN" and JSON body {}. The dashboard fans out the specialist agents in parallel and Crina synthesizes one weekly marketing report. Then GET DASHBOARD_URL/api/agents/team/report to retrieve the latest report JSON. Send the full report to Slack. On Telegram only announce status, problems, follow-ups, and approval requests — never the full report. Never publish or post content anywhere.
```

---

## 2. The trigger call (what Hermes runs under the hood)

```bash
# Kick off a parallel team run and capture the report
curl -s -X POST "DASHBOARD_URL/api/agents/team/run" \
  -H "Authorization: Bearer AGENT_TRIGGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Or fetch the latest already-generated report (for Slack)
curl -s "DASHBOARD_URL/api/agents/team/report" \
  -H "Authorization: Bearer AGENT_TRIGGER_TOKEN"
```

Optional body to scope a run:

```json
{ "brands": ["GridFactory.io"], "platforms": ["LinkedIn", "X"], "competitors": ["Acme"], "weekStartDate": "2026-06-22" }
```

The response is the full `TeamRunReport`: `synthesis` (Crina's executive
report), `agentOutputs` (each specialist's result), and `observability`
(durations, tokens, success/fallback/error counts).

---

## 3. The morning CRON ping (paste in the Telegram chat)

A scheduled job can't ask and then wait for your answer, so it **pings**, and you
**reply** separately — ping, then reply.

```
Create a daily cron job at 09:00 Asia/Dubai named "marketing-daily-ping". When it fires, send me a Telegram message: "Good morning — daily marketing team run ready. Targets are managed at DASHBOARD_URL/agent-brain. Reply GO to run, or EDIT to change targets first." Do not run anything yet; only ping.
```

Then your reply flow:

```
GO
```

→ Hermes runs the builder instructions from memory: calls `POST /api/agents/team/run`,
waits for the report, then:

```
On success: post the full report to Slack (#marketing or your channel) and send a short Telegram note "✅ Daily run done — N specialists, report in Slack."
On any fallback/error: send a Telegram alert "⚠️ Daily run used fallback / had errors — check Agent Brain at DASHBOARD_URL/agent-brain." Do not post to Slack if the report is empty.
On items needing approval: send a Telegram message listing what needs human approval with a link to DASHBOARD_URL/approvals.
```

---

## 4. Add a competitor by text (dynamic list)

Two options — keep the dashboard Targets list as the source of truth:

- **In the dashboard:** Agent Brain → Targets list → add (recommended).
- **By chat (memory only, nothing runs):**

```
Add "Linear" to my Agentic Marketing OS target list. Just update memory. Do not create or run anything yet.
```

Then when you say `GO`, the next run includes it. (If you want chat additions to
also hit the dashboard list, have Hermes `POST DASHBOARD_URL/api/agent-targets`
with the admin session — that endpoint is admin-only, not token-gated.)

---

## 5. Safety invariants (do not change)

- No agent publishes or posts. `live_posting_enabled` is `false` in `team.json`.
- Publishing Agent prepares **drafts only** and is excluded from auto-runs.
- Telegram is **announcements only**; the full report goes to Slack.
- The trigger token is the only machine credential; never put it in Slack/Telegram messages or logs.
