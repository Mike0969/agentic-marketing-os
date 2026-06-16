# Supabase Setup

Fast path: run `setup.sql` once in the Supabase SQL editor. It creates the tables, MVP policies, and seed records.

Alternative: run these files in order:

1. `schema.sql`
2. `seed.sql`

The current MVP policies allow `anon` and `authenticated` reads/writes so the dashboard works with the public anon key before login is implemented.

Before production, replace the MVP policies with organization/user-scoped RLS and move sensitive agent execution behind server routes or Edge Functions.

To verify local connectivity without printing secrets:

```bash
npm run check:supabase
```
