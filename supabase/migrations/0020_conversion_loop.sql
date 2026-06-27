-- Sales/Conversion loop: per-campaign funnel facts (manual + agent-estimated) and the durable
-- "what converts" insights Crina reads. Closes the marketing -> sales loop.

create table if not exists public.conversion_outcomes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  source text not null check (source in ('manual', 'agent_estimated')),
  -- funnel: Awareness -> Signup -> Activation -> Paid
  awareness integer not null default 0,
  signups integer not null default 0,
  activations integer not null default 0,
  paid integer not null default 0,
  revenue numeric not null default 0,
  signup_rate numeric,
  paid_conversion_rate numeric,
  notes text,
  period_start date,
  period_end date,
  recorded_by text,
  estimate_confidence text check (estimate_confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create table if not exists public.conversion_memory (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  platform text,
  content_type text,
  hook text,
  insight text not null,
  recommendation text,
  rank integer not null default 0,
  paid_conversion_rate numeric,
  evidence jsonb,
  source text not null default 'agent_estimated' check (source in ('manual', 'agent_estimated')),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversion_outcomes_brand on public.conversion_outcomes (brand_id, created_at desc);
create index if not exists idx_conversion_outcomes_campaign on public.conversion_outcomes (campaign_id);
create index if not exists idx_conversion_memory_brand_rank on public.conversion_memory (brand_id, rank desc, created_at desc);

alter table public.conversion_outcomes enable row level security;
alter table public.conversion_memory enable row level security;

drop policy if exists "conversion_outcomes admin read" on public.conversion_outcomes;
drop policy if exists "conversion_outcomes admin insert" on public.conversion_outcomes;
drop policy if exists "conversion_outcomes admin update" on public.conversion_outcomes;
drop policy if exists "conversion_memory admin read" on public.conversion_memory;
drop policy if exists "conversion_memory admin insert" on public.conversion_memory;
drop policy if exists "conversion_memory admin update" on public.conversion_memory;

create policy "conversion_outcomes admin read" on public.conversion_outcomes for select to authenticated using (public.is_admin());
create policy "conversion_outcomes admin insert" on public.conversion_outcomes for insert to authenticated with check (public.is_admin());
create policy "conversion_outcomes admin update" on public.conversion_outcomes for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "conversion_memory admin read" on public.conversion_memory for select to authenticated using (public.is_admin());
create policy "conversion_memory admin insert" on public.conversion_memory for insert to authenticated with check (public.is_admin());
create policy "conversion_memory admin update" on public.conversion_memory for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.conversion_outcomes to authenticated;
grant select, insert, update on public.conversion_memory to authenticated;

notify pgrst, 'reload schema';
