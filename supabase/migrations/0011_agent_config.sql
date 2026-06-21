-- Phase 1.5: per-agent provider + model assignment (the "Switch model" target).
-- The Agent Kanban writes here; agent runners read it at call time to pick the
-- provider/model (resolution order: agent_config → agent_settings → env default).
-- Safe to run multiple times.

create table if not exists agent_config (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null unique,       -- e.g. agent-crina, agent-fx-scanner
  provider text not null,              -- hermes | anthropic | openai | deepseek | glm | ollama
  model text not null,                 -- e.g. claude-sonnet-4
  updated_at timestamptz not null default now(),
  updated_by text                      -- admin email that set it
);

alter table agent_config enable row level security;
grant select, insert, update, delete on agent_config to authenticated;

drop policy if exists "admin read agent_config" on agent_config;
drop policy if exists "admin write agent_config" on agent_config;
create policy "admin read agent_config" on agent_config for select to authenticated using (public.is_admin());
create policy "admin write agent_config" on agent_config for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
