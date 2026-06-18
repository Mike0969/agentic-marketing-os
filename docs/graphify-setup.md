# Graphify — code knowledge-graph dev skill

Graphify is a **developer tool**, not part of the marketing runtime. It builds a
knowledge graph of this repo so the AI assistant answers codebase questions from
a map instead of re-reading files (faster, cheaper, more accurate). It is
separate from the Live Brain (which maps the *agent team*, not the source tree).

## Install (already done on this machine)

```bash
uv tool install graphifyy        # PyPI package is "graphifyy"; CLI is "graphify"
graphify install --project       # registers the Claude Code skill into .claude/
```

This created:
- `.claude/skills/graphify/SKILL.md` — the skill
- `.claude/settings.json` — PreToolUse hooks (only activate once a graph exists)
- `CLAUDE.md` — a graphify usage section

## Build / use the graph

```bash
/graphify .            # build a graph of the whole repo (run in Claude Code)
/graphify ./lib        # or scope to a folder
```

Outputs land in `graphify-out/`:
- `graph.html` — interactive visualization
- `GRAPH_REPORT.md` — key concepts + suggestions
- `graph.json` — queryable graph (the hooks reference this)

Query it:

```bash
graphify query "how does the team runner fan out?"
graphify explain "agent observability"
graphify path "team-runner" "agent_runs"
```

## Notes
- `graphify-out/` is generated; add it to `.gitignore` if you don't want it tracked.
- Headless extraction (`graphify extract`) needs an API key (ANTHROPIC/OPENAI/GEMINI) and is for CI only — not required for local use.
- This is dev tooling only; it never touches the marketing pipeline, agents, or live posting.
