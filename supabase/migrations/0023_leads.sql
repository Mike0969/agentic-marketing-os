-- T10: capture real lower-funnel lead intent from forms/manual logging.
-- These rows are the source of truth for Leads in the Reach -> Lead -> Investor -> Capital loop.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text,
  email text not null,
  company text,
  role text,
  segment text check (segment in ('investor', 'operator', 'developer', 'utility', 'other')),
  region text,
  power_requirement text,
  timeline text,
  diligence_stage text,
  wants text,
  source text not null default 'form' check (source in ('form', 'manual')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_brand_created on public.leads (brand_id, created_at desc);

alter table public.leads enable row level security;

drop policy if exists "leads admin read" on public.leads;
drop policy if exists "leads admin insert" on public.leads;
drop policy if exists "leads admin update" on public.leads;

create policy "leads admin read" on public.leads for select to authenticated using (public.is_admin());
create policy "leads admin insert" on public.leads for insert to authenticated with check (public.is_admin());
create policy "leads admin update" on public.leads for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.leads to authenticated;

alter table public.conversion_outcomes drop constraint if exists conversion_outcomes_source_check;
alter table public.conversion_outcomes
  add constraint conversion_outcomes_source_check
  check (source in ('manual', 'agent_estimated', 'google_search', 'lead_capture'));

notify pgrst, 'reload schema';
