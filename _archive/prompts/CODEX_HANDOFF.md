# Codex Handoff

Continue from the existing MVP. Do not rebuild the dashboard from scratch.

Working directory:

`/Users/dubai/Claude Folder/agentic-marketing-os`

Known good checks:

```bash
npm run build
npm run check:supabase
```

Current persistence model:

- Supabase is configured through `.env.local`.
- Local fallback persists to `data/local-dashboard.json`.
- Server API routes should remain Supabase-first with fallback when Supabase is not configured.
- When Supabase is configured, dashboard access requires Supabase Auth plus admin email authorization.
- Add the admin email to `public.admin_users`, or use `ADMIN_EMAIL` locally for first-admin development.

Important files:

- `lib/data.ts`
- `lib/local-store.ts`
- `lib/supabase/*`
- `lib/workflows/weekly-content-plan.ts`
- `lib/agents/crina-runner.ts`
- `lib/integration-store.ts`
- `lib/integrations.ts`
- `middleware.ts`
- `app/api/*`
- `supabase/setup.sql`

Guardrails:

- Do not expose secrets in browser code or committed files.
- Do not add real publishing yet.
- Crina should remain Hermes-first with deterministic fallback until another provider adapter is explicitly requested.
- Keep content creation in `idea` or `brief` until human approval.
- Keep social/analytics integrations read/connect scaffolds only until explicit publishing or live analytics work is requested.
