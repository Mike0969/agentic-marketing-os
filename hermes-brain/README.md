# Agentic Marketing OS Brain

Persistent shared resource collection for the Agentic Marketing OS team.

This repo directory is the canonical, deployable brain. The local Hermes Buddy
folder is a cache that can be refreshed with:

```bash
npm run brain:sync:to-hermes
```

Open this folder directly in Obsidian if you want a visual knowledge workspace;
do not edit only `/Users/dubai/.hermes/...` if the change must survive commits,
deployments, or another machine.

Default brain model: `gpt-5.5`  
Backup model currently configured in Buddy fallback chain: `deepseek-v4-flash`  
Live social posting: **disabled**

## Source of truth

- Stable brand rules, agent operating context, output schemas, and approval
  policies live here in git.
- Runtime learning lives in Supabase tables such as `feedback_memory`,
  `conversion_memory`, `content_queue`, `content_items`, and `agent_runs`.
- Local Hermes memory files are writable cache only. Automated consolidation may
  refresh that cache, but canonical edits should be made in this repo.
- Never store API keys, OAuth tokens, service-role keys, private keys, cookies,
  or customer secrets in this folder.

## Sections

1. [Brand briefs](brand-briefs.md)
2. [Workflow contract](workflow-contract.md)
3. [Content intelligence patterns](content-intelligence-patterns.md)
4. [Voice/calendar memory](voice-calendar-memory.md)
5. [Draft publishing safety](draft-publishing-safety.md)
6. [Token and model policy](token-model-policy.md)
7. [Brand voice](brand-voice.md)
8. [Winning hooks](winning-hooks.md)
9. [Weak hooks](weak-hooks.md)
10. [Competitor references](competitor-references.md)
11. [SEO targets](seo-targets.md)
12. [Content formulas](content-formulas.md)
13. [Approval rules](approval-rules.md)
14. [Reusable CTAs](reusable-ctas.md)
15. [Agent output schemas](agent-output-schemas.md)
16. Agent runtime memories:
   - [Crina](agent-crina-memory.md)
   - [Competitor Intelligence Agent](agent-competitor-intelligence-memory.md)
   - [SEO Agent](agent-seo-memory.md)
   - [Content Creator Agent](agent-content-creator-memory.md)
   - [Visual & Video Agent](agent-visual-video-memory.md)
   - [Publishing Agent](agent-publishing-memory.md)
   - [Analytics Agent](agent-analytics-memory.md)

## Usage contract

- Retrieve this brain before long reasoning for Agentic Marketing OS work.
- Keep dashboard responses concise and structured JSON.
- Do not store large full transcripts unless Mihai explicitly asks.
- Store short, stable run summaries, winning/weak phrases, postmortems, and
  reusable patterns here only when they are worth versioning.
- No live posting or social browser automation until explicit dashboard approval gates and platform OAuth exist.
