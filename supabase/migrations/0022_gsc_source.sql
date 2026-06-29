-- T8: ingest real Google Search Console signal into the conversion loop.
-- Allow 'google_search' as an outcome source and store structured GSC evidence.

alter table public.conversion_outcomes drop constraint if exists conversion_outcomes_source_check;
alter table public.conversion_outcomes
  add constraint conversion_outcomes_source_check
  check (source in ('manual', 'agent_estimated', 'google_search'));

alter table public.conversion_outcomes add column if not exists evidence jsonb;

notify pgrst, 'reload schema';
