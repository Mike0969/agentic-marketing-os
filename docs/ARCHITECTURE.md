# Architecture

Stack:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase database through `@supabase/ssr` and `@supabase/supabase-js`
- Local fallback store at `data/local-dashboard.json`

Core data model:

- `brands`
- `agents`
- `campaigns`
- `content_items`
- `approvals`
- `activity`

Read path:

- `lib/data.ts` reads Supabase when environment values are present.
- If Supabase is not configured, not migrated, or missing required records, the app falls back to `lib/local-store.ts`.

Write path:

- Brand saves: `PATCH /api/brands/[id]`
- Campaign creation: `POST /api/campaigns`
- Content item creation: `POST /api/content-items`
- Approval decisions: `POST /api/approvals`

Supabase setup:

- `supabase/setup.sql` creates tables, RLS policies, grants, and seed records.
- `npm run check:supabase` verifies table visibility and row counts.
- `npm run seed:supabase` can reseed after schema exists.

Security status:

- MVP RLS policies currently allow anon/authenticated CRUD so the dashboard is usable before auth.
- Production should replace MVP policies with organization/user scoped access and move provider secrets behind server-only routes.
