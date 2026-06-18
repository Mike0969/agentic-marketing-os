# Claude Parallel Task

Work only on documentation and planning. Do not edit app code, API routes, agent runners, components, migrations, or database access files while Codex is implementing the physics Live Brain.

## Repo

`/Users/dubai/Claude Folder/agentic-marketing-os`

## Current State

- Next.js App Router + TypeScript + Tailwind.
- Supabase Auth/database with admin-gated RLS and local JSON fallback.
- Hermes is called through OpenAI-compatible `/v1/chat/completions`.
- Hermes team registry + shared brain are the source of truth for agents.
- Crina weekly plan, content item creation, specialist dispatch, approvals, scheduling suggestions, Agent Brain, and Live Brain exist.
- Live posting remains intentionally disabled.

## Your Task

Create `docs/NEXT_SPRINT_PLAN.md` with a concise implementation brief for the next two sprints:

1. Agent chaining:
   - SEO Agent creates/updates brief on a selected content card.
   - Content Creator Agent drafts from the same card.
   - Visual & Video Agent adds visual direction on the same card.
   - Publishing Agent remains draft-only and must not live-post.

2. First real analytics integration:
   - Recommend either GA4 or Google Search Console as the lowest-risk first read-only connector.
   - Explain why.

## Include

- Data flow.
- Files likely touched.
- API route design.
- Supabase schema changes if needed.
- Risks.
- Test checklist.
- Strict governance reminder:
  - no live posting
  - Publishing Agent drafts only
  - human approval required before scheduled/published workflows

## Do Not Touch

- `components/live-brain.tsx`
- `app/system-map/page.tsx`
- `lib/agents/*`
- `lib/content-store.ts`
- `components/pipeline-board.tsx`
- `supabase/migrations/*`

