create extension if not exists "pgcrypto";

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text not null,
  positioning text not null,
  target_audience text not null,
  tone_of_voice text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items(id) on delete cascade,
  requested_by_agent text not null,
  decision text not null check (decision in ('pending', 'approved', 'rejected', 'changes_requested')),
  feedback text not null default '',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table brands enable row level security;
alter table agents enable row level security;
alter table campaigns enable row level security;
alter table content_items enable row level security;
alter table approvals enable row level security;

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

-- MVP policy: anon + authenticated access keeps the dashboard functional with the public anon key.
-- TODO: replace with user/team scoped policies once Supabase Auth is added.
create policy "mvp read brands" on brands for select to anon, authenticated using (true);
create policy "mvp write brands" on brands for all to anon, authenticated using (true) with check (true);
create policy "mvp read agents" on agents for select to anon, authenticated using (true);
create policy "mvp write agents" on agents for all to anon, authenticated using (true) with check (true);
create policy "mvp read campaigns" on campaigns for select to anon, authenticated using (true);
create policy "mvp write campaigns" on campaigns for all to anon, authenticated using (true) with check (true);
create policy "mvp read content_items" on content_items for select to anon, authenticated using (true);
create policy "mvp write content_items" on content_items for all to anon, authenticated using (true) with check (true);
create policy "mvp read approvals" on approvals for select to anon, authenticated using (true);
create policy "mvp write approvals" on approvals for all to anon, authenticated using (true) with check (true);
