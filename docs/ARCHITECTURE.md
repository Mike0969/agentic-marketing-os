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
- `admin_users`
- `integration_configs`
- `agent_runs`

Read path:

- `lib/data.ts` reads Supabase when environment values are present.
- If Supabase is not configured, not migrated, or missing required records, the app falls back to `lib/local-store.ts`.

Write path:

- Brand saves: `PATCH /api/brands/[id]`
- Campaign creation: `POST /api/campaigns`
- Content item creation: `POST /api/content-items`
- Approval decisions: `POST /api/approvals`
- Integration settings: `GET/POST /api/integrations`
- Integration tests: `POST /api/integrations/[provider]/test`
- Crina agent run: `POST /api/agents/crina/weekly-content-plan`

Auth path:

- `/login` uses Supabase Auth email/password.
- `middleware.ts` redirects unauthenticated or non-admin users away from protected dashboard routes.
- `POST /api/auth/logout` signs out the current Supabase session.

Supabase setup:

- `supabase/setup.sql` creates tables, RLS policies, grants, and seed records.
- `npm run check:supabase` verifies table visibility and row counts.
- `npm run seed:supabase` can reseed after schema exists.

Security status:

- RLS is enabled on dashboard tables and scoped to authenticated admin users.
- The current access model is Single Admin by email through `admin_users` or local `ADMIN_EMAIL`.
- Integration secrets are not returned to the browser. The current implementation stores metadata plus a `secret_ref` placeholder; enabling Supabase Vault/RPC is the next security hardening step.
