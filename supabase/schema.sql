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

-- MVP policy: authenticated users can operate the dashboard.
create policy "authenticated read brands" on brands for select to authenticated using (true);
create policy "authenticated write brands" on brands for all to authenticated using (true) with check (true);
create policy "authenticated read agents" on agents for select to authenticated using (true);
create policy "authenticated write agents" on agents for all to authenticated using (true) with check (true);
create policy "authenticated read campaigns" on campaigns for select to authenticated using (true);
create policy "authenticated write campaigns" on campaigns for all to authenticated using (true) with check (true);
create policy "authenticated read content_items" on content_items for select to authenticated using (true);
create policy "authenticated write content_items" on content_items for all to authenticated using (true) with check (true);
create policy "authenticated read approvals" on approvals for select to authenticated using (true);
create policy "authenticated write approvals" on approvals for all to authenticated using (true) with check (true);
