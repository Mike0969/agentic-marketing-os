-- Per-agent model overrides and the editable team targets list.
-- Safe to run multiple times.

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

notify pgrst, 'reload schema';
