-- Allow 'needs_key' as an agent_runs status: the agent did its model work but its
-- full job needs a provider key that is not configured (e.g. image generation).
-- Shown as its own "Needs key" state on the Agents board, never as Error.
-- Safe to run multiple times.

alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check
  check (status in ('success', 'fallback', 'error', 'rate_limited', 'needs_key'));

notify pgrst, 'reload schema';
