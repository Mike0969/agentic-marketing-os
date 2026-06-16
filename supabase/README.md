# Supabase Setup

Run these files in the Supabase SQL editor, in order:

1. `schema.sql`
2. `seed.sql`

The current MVP policies allow `anon` and `authenticated` reads/writes so the dashboard works with the public anon key before login is implemented.

Before production, replace the MVP policies with organization/user-scoped RLS and move sensitive agent execution behind server routes or Edge Functions.

To verify local connectivity without printing secrets:

```bash
npm run check:supabase
```
