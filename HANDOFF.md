# HANDOFF — read this first

Living state doc so any session (Claude app, VS Code, Codex, Hermes) can pick up
accurately without re-deriving context. Update it when state changes materially.

_Last updated: 2026-07-12._

## What this is
`agentic-marketing-os` — a Next.js 15 (App Router, TS strict, Tailwind, Supabase)
autonomous marketing platform for **GridFactory.io** and **Gulf-EL.com / NexRide**.
GitHub: `Mike0969/agentic-marketing-os`; `main` auto-deploys to Vercel. It is NOT a
prototype — the autonomous loop is real: a Vercel cron hits
`/api/marketing/automation/cron` every ~2 min and drives GSC analytics ingestion,
scheduled posting (gated by `SOCIAL_POSTING_ENABLED`), nurture email, weekly
self-tuning (memory consolidation + reflection), and the content pipeline. Governance:
agents draft only, human approval gates, secrets server-side, deterministic FALLBACK
when Hermes is down.

## Current state (2026-07-12)
- **Supabase: LIVE** (was paused mid-session, now resumed). `npm run check:supabase`
  passes; real data present (2 brands, 11 campaigns, 30 content items, 208 agent runs).
- **Readiness: AUTONOMOUS, 3/3 required.** Check any time: `npm run preflight` (plain
  English) or `GET /api/health`. Dashboard home shows an Autonomy panel.
- Build/tsc/lint green. Tests: `npm test` (Node built-in runner, zero extra deps).

## Recently built (this session)
1. **Autonomy readiness self-check** — `lib/health/readiness.ts`, `/api/health`,
   `npm run preflight`, home-page panel. Config-only, never leaks secret values.
2. **Local-folder inspiration library** — drop videos/visuals in
   `public/inspiration/<gridfactory|gulf_el_nexride>/` (naming `linkedin+x__Title.mp4`);
   agents use them via `lib/marketing/project-assets.ts` with the reuse rule (never the
   same asset twice on one platform; single-use once total), shared+tested in
   `lib/marketing/asset-reuse-policy.ts`. NOTE: in pure local mode the campaign-run path
   is Supabase-gated, so agents consume the library on the cloud path (Supabase now live).
3. **Brain tab** (`/brain`) — embeds the cross-venture knowledge graph from the sibling
   `business-brain` repo. `npm run brain:graph` refreshes the committed snapshot
   (`public/brain/graph.html`); vis-network is vendored locally (no CDN); iframe is
   `sandbox=allow-scripts` only; middleware exempts `/brain/vendor/` (public lib) but
   keeps `graph.html` auth-protected.

## Sibling repos (same GitHub account)
- `Mike0969/business-brain` — the layer-3 markdown "second brain" across all ventures
  (marketing mirror + trading/projects/sourcing skeletons + graphify graph + daily
  routine). `bin/sync-marketing.sh` mirrors this app's `hermes-brain/` into it.
- `Mike0969/codex-dispatch-kit` — the reusable multi-model dispatch pipeline installer.

## How work is done here (ROUTING.md)
This repo has `ROUTING.md` + `REVIEW-RUBRIC.md` installed. Loop: plan → sol xhigh
adversarial review → reconcile (PLAN.v2) → Opus implements → **sol** high code review
(operator preference: sol, not terra). Reviews run via the `codex@openai-codex` plugin.

## Open items / next
- Optional: add a **Sogni** image provider (OpenAI-compatible) to
  `lib/providers/image-generation.ts` — its own plan→review→build.
- Fill `business-brain` `trading/` and `projects/` skeletons with real content.
- `.env.local.pre-localmode.bak` is a leftover secrets backup (gitignored) — safe to delete.
