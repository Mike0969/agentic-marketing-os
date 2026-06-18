create table if not exists public.agent_learning_events (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.content_items(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  agent_id text,
  agent_name text not null,
  decision text not null,
  feedback text not null default '',
  tags text[] not null default '{}',
  summary text not null default '',
  created_at timestamptz not null default now()
);

alter table public.agent_learning_events enable row level security;

drop policy if exists "admin read agent learning events" on public.agent_learning_events;
drop policy if exists "admin write agent learning events" on public.agent_learning_events;

create policy "admin read agent learning events"
on public.agent_learning_events
for select
to authenticated
using (public.is_admin(auth.email()));

create policy "admin write agent learning events"
on public.agent_learning_events
for all
to authenticated
using (public.is_admin(auth.email()))
with check (public.is_admin(auth.email()));

create index if not exists agent_learning_events_content_item_idx on public.agent_learning_events(content_item_id);
create index if not exists agent_learning_events_agent_idx on public.agent_learning_events(agent_id);
create index if not exists agent_learning_events_created_idx on public.agent_learning_events(created_at desc);
