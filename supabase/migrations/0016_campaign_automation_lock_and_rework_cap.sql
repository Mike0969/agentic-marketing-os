alter table public.campaigns
  add column if not exists automation_running boolean not null default false,
  add column if not exists automation_lease_until timestamptz;

alter table public.content_items
  add column if not exists loop_iteration integer not null default 0;

create index if not exists campaigns_automation_lease_until_idx
  on public.campaigns (automation_lease_until);

notify pgrst, 'reload schema';
