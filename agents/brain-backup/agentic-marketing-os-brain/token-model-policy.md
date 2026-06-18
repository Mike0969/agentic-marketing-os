# Token and model policy

- Default brain model: `gpt-5.5`.
- Buddy fallback model currently configured: `deepseek-v4-flash`.
- Keep outputs concise and structured JSON when called by the dashboard.
- Prefer retrieval from `agentic-marketing-os-brain` before long reasoning.
- If a backup model is changed later, report the backup model name to Codex so it can be placed in `HERMES_AGENT_BACKUP_MODEL`.
- Use short summaries for run memory.
- Do not store full large transcripts unless requested.
- Do not expose secrets in dashboard responses, Kanban cards, logs, or shared brain files.
