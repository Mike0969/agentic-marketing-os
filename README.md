# Agentic Marketing Agency OS

MVP dashboard/control tower for AI-assisted marketing operations across **GridFactory.io** and **Gulf-EL.com / NexRide**.

The app is built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase-ready data access. It works immediately with mock seed data if Supabase credentials are not configured.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

Copy `.env.example` to `.env.local` and add Supabase values when ready:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Without those values, the dashboard uses `lib/seed.ts`.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Add environment values to `.env.local`.
4. Seed the default brands, agents, campaigns, content items, and approvals from `lib/seed.ts` or create a small seed script.

## Included pages

- Home dashboard with active brands, campaigns, pipeline counts, approvals, and recent activity
- Brands page with editable mock brand profiles
- Agents page with seven default AI marketing agents
- Campaigns page with local campaign creation
- Content Pipeline Kanban with Idea, Brief, Draft, Visual, Approval, Scheduled, Published, Analyzed
- Approval Queue with approve, reject, and request-changes actions
- Analytics placeholders for impressions, engagement, clicks, leads, top content, and weak content
- Settings placeholders for OpenAI, Anthropic, DeepSeek, n8n, Telegram, LinkedIn, X, TikTok, Instagram, Facebook, Search Console, and GA4

## Next implementation steps

- Replace client-side mock state with Supabase mutations.
- Add Supabase Auth routes and protected dashboard access.
- Add seed script for first-run default records.
- Connect Crina and specialist agents through an orchestration layer.
- Add n8n webhooks for campaign planning, content generation, approval notifications, publishing preparation, and analytics summaries.
- Add real integrations for LinkedIn, X, TikTok, Instagram, Facebook, GA4, and Google Search Console.
- Add audit logs for approval decisions and agent actions.
