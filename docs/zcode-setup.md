# ZCode Setup — GLM-5.2 as Third Coding Agent

## What is ZCode
ZCode is Z.ai's coding agent running GLM-5.2 (355B, MIT licensed).
Use it when Codex tokens run out or for bulk/cheap tasks.

## Connect to this repo
1. Open the ZCode desktop app
2. Click the workspace dropdown → **Add workspace**
3. Select the `agentic-marketing-os` folder
4. ZCode now reads/writes the full repo

## When to use which agent
| Agent | Model | Use for |
|-------|-------|---------|
| Claude (VS Code) | Claude Sonnet/Opus | Architecture, specs, complex reasoning |
| Codex (VS Code) | GPT-5.5 | Heavy implementation, complex multi-file |
| ZCode (desktop) | GLM-5.2 | Bulk UI, cheap tasks, when Codex runs out |

## ZCode handoff prompt
Paste this at the start of every ZCode session:

```
You are an implementation agent for my Agentic OS.
Repo: agentic-marketing-os — already open in your workspace.
Pull latest from main before starting.
Read CODEX_PLAN.md to find current phase and next uncompleted task.
Read docs/os-architecture.md for full context.
Rules:
- Every agent call via lib/agents/hermes-client.ts only
- Every run logs to agent_runs in Supabase
- Fallback outputs show FALLBACK badge
- Build/tsc/lint green after every task
- No broker orders, no live posting, no auto-send
- Report after each task before moving to next
Check last git commit, find next uncompleted task in CODEX_PLAN.md, start there.
```

## Notes
- GLM-5.2: 1M context, $1.40 / $4.40 per million tokens (input/output), OpenAI-compatible.
- Free tier has rate limits — add credits at z.ai if you hit 429 errors. In this OS,
  a 429 surfaces as a yellow **RATE LIMITED** badge (not a red error): the run is logged
  with status `rate_limited`, message "GLM-5.2 rate limit — add credits at z.ai or retry in 60s",
  and the provider auto-retries once after 10s before returning the soft result.
- ZCode is best for supervised tasks — always review output before committing.
