-- Hard model-call budget for the Marketing OS (Mihai 2026-11-20, after the shared Codex usage limit
-- was hit): a cap per campaign and per day (UTC), set in Settings, plus a Hermes limit breaker.
-- While a provider usage limit is active, no model call is made until it resets.
-- Safe to run repeatedly.

create table if not exists model_budget (
  id int primary key default 1 check (id = 1),
  per_campaign_max int not null default 40 check (per_campaign_max between 1 and 10000),
  per_day_max int not null default 150 check (per_day_max between 1 and 100000),
  hermes_blocked_until timestamptz,
  hermes_block_reason text,
  updated_at timestamptz not null default now()
);
insert into model_budget (id) values (1) on conflict (id) do nothing;

-- One row per model call (Hermes, other LLM providers, Jev). Counted against the caps above.
create table if not exists model_calls (
  id bigserial primary key,
  at timestamptz not null default now(),
  campaign_id uuid references campaigns(id) on delete set null,
  kind text not null,
  agent_id text
);
create index if not exists model_calls_at_idx on model_calls (at);
create index if not exists model_calls_campaign_idx on model_calls (campaign_id);

alter table model_budget enable row level security;
alter table model_calls enable row level security;
grant select, insert, update on model_budget to authenticated;
grant select, insert on model_calls to authenticated;
grant usage, select on sequence model_calls_id_seq to authenticated;

drop policy if exists "admin model_budget" on model_budget;
drop policy if exists "admin model_calls" on model_calls;
create policy "admin model_budget" on model_budget for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin model_calls" on model_calls for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
