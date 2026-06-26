-- Campaign-ideas model: Crina proposes ideas (status 'idea', not running). The operator
-- selects one (or many) to run; the rest are 'archived'. idea_brief holds the full,
-- readable proposal so the operator can review before choosing.

alter table public.campaigns
  add column if not exists idea_brief jsonb,
  add column if not exists selected_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('idea', 'planning', 'active', 'paused', 'completed', 'archived'));

create index if not exists idx_campaigns_status on public.campaigns (status);

notify pgrst, 'reload schema';
