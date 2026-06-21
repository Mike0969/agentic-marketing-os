-- Allow 'rate_limited' as an agent_runs status (soft provider HTTP 429).
-- Distinct from 'error' so rate limits show as a yellow badge, not a red error.
-- Safe to run multiple times.

alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check
  check (status in ('success', 'fallback', 'error', 'rate_limited'));

notify pgrst, 'reload schema';
