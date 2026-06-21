create extension if not exists "pgcrypto";

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text not null,
  positioning text not null,
  target_audience text not null,
  tone_of_voice text not null,
  pillars text,
  content_pillars text,
  key_messages text,
  proof_points text,
  offers text,
  competitors text,
  seo_targets text,
  approval_rules text,
  ctas text,
  reusable_ctas text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table brands add column if not exists content_pillars text;
alter table brands add column if not exists pillars text;
alter table brands add column if not exists key_messages text;
alter table brands add column if not exists proof_points text;
alter table brands add column if not exists offers text;
alter table brands add column if not exists competitors text;
alter table brands add column if not exists seo_targets text;
alter table brands add column if not exists approval_rules text;
alter table brands add column if not exists reusable_ctas text;
alter table brands add column if not exists ctas text;

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  description text not null,
  model_preference text not null,
  status text not null check (status in ('active', 'standby', 'paused')),
  brand_scope text not null,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,
  objective text not null,
  target_audience text not null,
  status text not null check (status in ('planning', 'active', 'paused', 'completed')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists content_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  platform text not null,
  content_type text not null,
  title text not null,
  body text not null,
  hook text not null,
  "CTA" text not null,
  status text not null check (status in ('idea', 'brief', 'draft', 'visual', 'approval', 'scheduled', 'published', 'analyzed')),
  assigned_agent text not null,
  approval_status text not null check (approval_status in ('not_requested', 'pending', 'approved', 'rejected', 'changes_requested')),
  scheduled_at timestamptz,
  published_at timestamptz,
  performance_summary text,
  visual_asset_url text,
  visual_asset_prompt text,
  visual_asset_status text default 'not_requested',
  visual_asset_model text,
  visual_asset_error text,
  created_at timestamptz not null default now()
);

alter table content_items add column if not exists visual_asset_url text;
alter table content_items add column if not exists visual_asset_prompt text;
alter table content_items add column if not exists visual_asset_status text default 'not_requested';
alter table content_items add column if not exists visual_asset_model text;
alter table content_items add column if not exists visual_asset_error text;

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  requested_by_agent text not null,
  decision text not null check (decision in ('pending', 'approved', 'rejected', 'changes_requested')),
  feedback text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  detail text not null,
  timestamp text not null default 'Just now',
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists integration_configs (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  display_name text not null,
  status text not null default 'not_configured' check (status in ('not_configured', 'configured', 'connected', 'error', 'testable')),
  metadata jsonb not null default '{}'::jsonb,
  configured boolean not null default false,
  secret_ref text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  workflow_name text not null,
  provider text not null,
  status text not null check (status in ('success', 'fallback', 'error')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Observability fields (nullable; Hermes may not return token usage yet).
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

alter table brands enable row level security;
alter table agents enable row level security;
alter table campaigns enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;
alter table activity enable row level security;
alter table admin_users enable row level security;
alter table integration_configs enable row level security;
alter table agent_runs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.schema_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'brands', (select count(*) from public.brands),
    'agents', (select count(*) from public.agents),
    'campaigns', (select count(*) from public.campaigns),
    'content_items', (select count(*) from public.content_items),
    'approvals', (select count(*) from public.approvals),
    'activity', (select count(*) from public.activity),
    'admin_users', (select count(*) from public.admin_users),
    'integration_configs', (select count(*) from public.integration_configs),
    'agent_runs', (select count(*) from public.agent_runs)
  );
$$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on brands to anon, authenticated;
grant select, insert, update, delete on agents to anon, authenticated;
grant select, insert, update, delete on campaigns to anon, authenticated;
grant select, insert, update, delete on content_items to anon, authenticated;
grant select, insert, update, delete on approvals to anon, authenticated;
grant select, insert, update, delete on activity to anon, authenticated;
grant select, insert, update, delete on admin_users to authenticated;
grant select, insert, update, delete on integration_configs to authenticated;
grant select, insert, update, delete on agent_runs to authenticated;
grant execute on function public.schema_health() to anon, authenticated;

drop policy if exists "mvp read brands" on brands;
drop policy if exists "mvp write brands" on brands;
drop policy if exists "mvp read agents" on agents;
drop policy if exists "mvp write agents" on agents;
drop policy if exists "mvp read campaigns" on campaigns;
drop policy if exists "mvp write campaigns" on campaigns;
drop policy if exists "mvp read content_items" on content_items;
drop policy if exists "mvp write content_items" on content_items;
drop policy if exists "mvp read approvals" on approvals;
drop policy if exists "mvp write approvals" on approvals;
drop policy if exists "mvp read activity" on activity;
drop policy if exists "mvp write activity" on activity;
drop policy if exists "admin read brands" on brands;
drop policy if exists "admin write brands" on brands;
drop policy if exists "admin read agents" on agents;
drop policy if exists "admin write agents" on agents;
drop policy if exists "admin read campaigns" on campaigns;
drop policy if exists "admin write campaigns" on campaigns;
drop policy if exists "admin read content_items" on content_items;
drop policy if exists "admin write content_items" on content_items;
drop policy if exists "admin read approvals" on approvals;
drop policy if exists "admin write approvals" on approvals;
drop policy if exists "admin read activity" on activity;
drop policy if exists "admin write activity" on activity;
drop policy if exists "admin self read" on admin_users;
drop policy if exists "admin manage admins" on admin_users;
drop policy if exists "admin read integration_configs" on integration_configs;
drop policy if exists "admin write integration_configs" on integration_configs;
drop policy if exists "admin read agent_runs" on agent_runs;
drop policy if exists "admin write agent_runs" on agent_runs;

create policy "admin read brands" on brands for select to authenticated using (public.is_admin());
create policy "admin write brands" on brands for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read agents" on agents for select to authenticated using (public.is_admin());
create policy "admin write agents" on agents for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read campaigns" on campaigns for select to authenticated using (public.is_admin());
create policy "admin write campaigns" on campaigns for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read content_items" on content_items for select to authenticated using (public.is_admin());
create policy "admin write content_items" on content_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read approvals" on approvals for select to authenticated using (public.is_admin());
create policy "admin write approvals" on approvals for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read activity" on activity for select to authenticated using (public.is_admin());
create policy "admin write activity" on activity for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin self read" on admin_users for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_admin());
create policy "admin manage admins" on admin_users for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read integration_configs" on integration_configs for select to authenticated using (public.is_admin());
create policy "admin write integration_configs" on integration_configs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read agent_runs" on agent_runs for select to authenticated using (public.is_admin());
create policy "admin write agent_runs" on agent_runs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Per-agent model overrides and editable team targets list.
create table if not exists agent_settings (
  agent_id text primary key,
  model text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists agent_targets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null default 'competitor' check (type in ('competitor', 'topic', 'platform', 'brand')),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table agent_settings enable row level security;
alter table agent_targets enable row level security;

grant select, insert, update, delete on agent_settings to authenticated;
grant select, insert, update, delete on agent_targets to authenticated;

drop policy if exists "admin read agent_settings" on agent_settings;
drop policy if exists "admin write agent_settings" on agent_settings;
drop policy if exists "admin read agent_targets" on agent_targets;
drop policy if exists "admin write agent_targets" on agent_targets;

create policy "admin read agent_settings" on agent_settings for select to authenticated using (public.is_admin());
create policy "admin write agent_settings" on agent_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read agent_targets" on agent_targets for select to authenticated using (public.is_admin());
create policy "admin write agent_targets" on agent_targets for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Inter-agent signals / escalations.
create table if not exists agent_signals (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  agent_name text not null,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'ack', 'resolved', 'needs_approval')),
  run_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists agent_signals_status_idx on agent_signals (status, created_at desc);

alter table agent_signals enable row level security;
grant select, insert, update, delete on agent_signals to authenticated;

drop policy if exists "admin read agent_signals" on agent_signals;
drop policy if exists "admin write agent_signals" on agent_signals;
create policy "admin read agent_signals" on agent_signals for select to authenticated using (public.is_admin());
create policy "admin write agent_signals" on agent_signals for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Managed list of models selectable per agent.
create table if not exists model_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null default '',
  notes text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table model_registry enable row level security;
grant select, insert, update, delete on model_registry to authenticated;

drop policy if exists "admin read model_registry" on model_registry;
drop policy if exists "admin write model_registry" on model_registry;
create policy "admin read model_registry" on model_registry for select to authenticated using (public.is_admin());
create policy "admin write model_registry" on model_registry for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
