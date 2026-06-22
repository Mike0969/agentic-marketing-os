create table if not exists public.feedback_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  content_type text not null,
  content_summary text,
  content_full jsonb,
  decision text not null check (decision in ('approved','rejected','remade')),
  reason text,
  decided_by text not null check (decided_by in ('human','crina')),
  loop_iteration integer default 1,
  created_at timestamptz default now()
);

create table if not exists public.content_queue (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'pending_crina'
    check (status in ('pending_crina','pending_human','approved','rejected','remade')),
  content jsonb not null,
  agent_id text,
  crina_verdict text,
  crina_reason text,
  loop_iteration integer default 1,
  human_decision text,
  human_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.feedback_memory enable row level security;
alter table public.content_queue enable row level security;

drop policy if exists "feedback_memory admin read" on public.feedback_memory;
drop policy if exists "feedback_memory admin insert" on public.feedback_memory;
drop policy if exists "feedback_memory admin update" on public.feedback_memory;
drop policy if exists "content_queue admin read" on public.content_queue;
drop policy if exists "content_queue admin insert" on public.content_queue;
drop policy if exists "content_queue admin update" on public.content_queue;

create policy "feedback_memory admin read"
  on public.feedback_memory for select
  to authenticated
  using (public.is_admin());

create policy "feedback_memory admin insert"
  on public.feedback_memory for insert
  to authenticated
  with check (public.is_admin());

create policy "feedback_memory admin update"
  on public.feedback_memory for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "content_queue admin read"
  on public.content_queue for select
  to authenticated
  using (public.is_admin());

create policy "content_queue admin insert"
  on public.content_queue for insert
  to authenticated
  with check (public.is_admin());

create policy "content_queue admin update"
  on public.content_queue for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update on public.feedback_memory to authenticated;
grant select, insert, update on public.content_queue to authenticated;

notify pgrst, 'reload schema';
