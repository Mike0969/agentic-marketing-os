-- Which Learning library items each agent run read (Mihai 2026-11-20: with ~700 items the agents get
-- only the ~10 most relevant per run, and the Library shows which ones). Safe to run repeatedly.

create table if not exists learning_item_uses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  item_id uuid not null references learning_items(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  part text not null check (part in ('plan', 'run')),
  rank smallint not null default 0,
  used_at timestamptz not null default now()
);
create index if not exists learning_item_uses_used_at_idx on learning_item_uses (used_at desc);
create index if not exists learning_item_uses_item_idx on learning_item_uses (item_id);

alter table learning_item_uses enable row level security;
grant select, insert, update, delete on learning_item_uses to authenticated;
drop policy if exists "admin learning_item_uses" on learning_item_uses;
create policy "admin learning_item_uses" on learning_item_uses for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
