-- Allow 'blocked' as an agent_runs status: a safety check stopped the run on purpose
-- (e.g. a campaign draft failed the content safety review). Shown amber as "Blocked"
-- on the Agents board; 'error' stays for real failures. Safe to run multiple times.

alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check
  check (status in ('success', 'fallback', 'error', 'rate_limited', 'needs_key', 'blocked'));

notify pgrst, 'reload schema';
