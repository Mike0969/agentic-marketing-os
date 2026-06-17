-- Agent observability fields for agent_runs.
-- All columns are nullable: Hermes may not return token usage yet, so we store
-- null rather than fabricated numbers. Safe to run multiple times.

alter table agent_runs add column if not exists agent_id text;
alter table agent_runs add column if not exists model text;
alter table agent_runs add column if not exists backup_model text;
alter table agent_runs add column if not exists tokens_prompt integer;
alter table agent_runs add column if not exists tokens_completion integer;
alter table agent_runs add column if not exists tokens_total integer;
alter table agent_runs add column if not exists duration_ms integer;
alter table agent_runs add column if not exists brain_resources_used jsonb;
alter table agent_runs add column if not exists handoff_from text;
alter table agent_runs add column if not exists handoff_to text;
alter table agent_runs add column if not exists provider_response_status integer;

notify pgrst, 'reload schema';
