-- Managed list of models selectable per agent. Safe to run repeatedly.

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

-- Seed the two models you use today (no-op if they already exist by name).
insert into model_registry (name, provider, notes)
select 'gpt-5.5', 'hermes', 'Default brain model'
where not exists (select 1 from model_registry where name = 'gpt-5.5');

insert into model_registry (name, provider, notes)
select 'deepseek-v4-flash', 'hermes', 'Fast/cheap backup'
where not exists (select 1 from model_registry where name = 'deepseek-v4-flash');

notify pgrst, 'reload schema';
