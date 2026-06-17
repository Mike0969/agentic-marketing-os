# Agentic Marketing Agency OS

MVP dashboard/control tower for AI-assisted marketing operations across **GridFactory.io** and **Gulf-EL.com / NexRide**.

The app is built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/database, and a local JSON fallback. It works immediately with seed data if Supabase credentials are not configured.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

If Next.js serves a stale `.next` bundle during local development, stop all running `next dev` processes and use:

```bash
npm run dev:clean
```

## Environment

Copy `.env.example` to `.env.local` and add Supabase values when ready:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
HERMES_AGENT_ENDPOINT=
HERMES_AGENT_TOKEN=
HERMES_AGENT_MODEL=gpt-5.5
HERMES_AGENT_TIMEOUT_MS=120000
HERMES_AGENT_BACKUP_MODEL=
```

Without those values, the dashboard uses `lib/seed.ts`.

Generated local workflow output is stored in `data/local-dashboard.json`, which is ignored by git. This makes the MVP usable without Supabase while keeping generated development data out of commits.

## Admin login

When Supabase is configured, dashboard routes are protected by Supabase Auth and an admin email allow-list.

1. Create a user in Supabase Auth.
2. Add the same email to `public.admin_users`:

```sql
insert into public.admin_users (email)
values ('you@example.com')
on conflict (email) do nothing;
```

For local development only, you can also set `ADMIN_EMAIL=you@example.com` in `.env.local`.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/setup.sql` in the SQL editor.
3. Add environment values to `.env.local`.
4. Add your admin email to `admin_users`.
5. Verify the connection with `npm run check:supabase`.

You can also seed through the app connection after running `schema.sql`:

```bash
npm run seed:supabase
```

## Included pages

- Home dashboard with active brands, campaigns, pipeline counts, approvals, and recent activity
- Brands page with editable brand profiles
- Agents page with seven default AI marketing agents
- Campaigns page with server-backed campaign creation
- Workflow page for Crina to generate a weekly content plan through Hermes when configured, with deterministic fallback
- Content Pipeline Kanban with Idea, Brief, Draft, Visual, Approval, Scheduled, Published, Analyzed
- Approval Queue with approve, reject, and request-changes actions persisted through server routes
- Analytics placeholders plus stored connector readiness for social/search/web analytics
- Settings integration console for OpenAI, Anthropic, DeepSeek, Hermes, n8n, Telegram, LinkedIn, X, TikTok, Instagram, Facebook, Search Console, and GA4

## Next implementation steps

- Enable Supabase Vault and replace the current `secret_ref` placeholder with real Vault RPC secret writes.
- Add user/team membership beyond the current Single Admin model.
- Register specialist agents in Hermes using `agents/hermes-buddy-subagents-prompt.md`, then wire their Hermes IDs into agent-specific dashboard routes.
- Add n8n webhooks for campaign planning, content generation, approval notifications, publishing preparation, and analytics summaries.
- Add real integrations for LinkedIn, X, TikTok, Instagram, Facebook, GA4, and Google Search Console.
- Replace placeholder connector tests with live read-only API health checks.
