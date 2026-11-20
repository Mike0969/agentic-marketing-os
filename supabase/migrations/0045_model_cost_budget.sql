-- Budget in dollars (admin 2026-11-20: "check the structure"; a DeepSeek call costs a fraction of a GPT
-- call, so counting raw calls is wrong). Each model call keeps its model, tokens and cost; prices per
-- model are editable in Settings; optional caps per day and per campaign in USD (none by default). Hermes (Codex
-- subscription) costs $0 per call and is still listed. Safe to run repeatedly.

alter table model_calls add column if not exists model text;
alter table model_calls add column if not exists tokens_in integer;
alter table model_calls add column if not exists tokens_out integer;
alter table model_calls add column if not exists cost_usd numeric(12, 6) not null default 0;
create index if not exists model_calls_campaign_idx on model_calls (campaign_id);

-- No limit by default (admin 2026-11-20: "remove the limit"): null = no cap. He can set one in Settings.
alter table model_budget add column if not exists per_day_usd numeric(10, 2);
alter table model_budget add column if not exists per_campaign_usd numeric(10, 2);

create table if not exists model_prices (
  provider text not null,                -- hermes | openai | deepseek | jev | custom:<id> | * (any)
  model text not null,                   -- exact model id, or * for the provider's default
  usd_per_m_in numeric(10, 4) not null default 0,
  usd_per_m_out numeric(10, 4) not null default 0,
  usd_per_call numeric(10, 6) not null default 0,
  verified boolean not null default false, -- false = an estimate; check the provider's price page
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);
alter table model_prices enable row level security;
grant select, insert, update, delete on model_prices to authenticated;
drop policy if exists "admin model_prices" on model_prices;
create policy "admin model_prices" on model_prices for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into model_prices (provider, model, usd_per_m_in, usd_per_m_out, usd_per_call, verified, note) values
  ('hermes', '*', 0, 0, 0, true, 'Codex subscription: $0 per call (counts against the shared quota)'),
  ('deepseek', '*', 0.28, 1.10, 0, false, 'estimate'),
  ('openai', 'gpt-5-mini', 0.25, 2.00, 0, false, 'estimate'),
  ('openai', '*', 1.25, 10.00, 0, false, 'estimate (GPT-5-class); set your model''s real price'),
  ('jev', '*', 0, 0, 0, false, 'TypeSafe price per check unknown: set it'),
  ('gpt-image', '*', 0, 0, 0.04, false, 'estimate per generated image (gpt-image-1, 1024px, medium)'),
  ('gpt-image', 'failed', 0, 0, 0, true, 'a failed image attempt is not billed'),
  ('*', '*', 1.25, 10.00, 0, false, 'fallback for any other model (estimate)')
on conflict (provider, model) do nothing;

notify pgrst, 'reload schema';
