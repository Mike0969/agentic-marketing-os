alter table public.campaigns
  add column if not exists automation_status text not null default 'idle',
  add column if not exists automation_mode text not null default 'human_gate',
  add column if not exists automation_locked_until timestamptz,
  add column if not exists automation_last_tick_at timestamptz,
  add column if not exists automation_error text,
  add column if not exists automation_no_progress_count integer not null default 0,
  add column if not exists automation_started_at timestamptz;

alter table public.campaigns
  drop constraint if exists campaigns_automation_status_check;

alter table public.campaigns
  add constraint campaigns_automation_status_check
  check (automation_status in ('idle', 'running', 'paused', 'needs_attention', 'waiting_human', 'publishing_prep', 'complete'));

alter table public.campaigns
  drop constraint if exists campaigns_automation_mode_check;

alter table public.campaigns
  add constraint campaigns_automation_mode_check
  check (automation_mode in ('human_gate', 'autopilot'));

create index if not exists campaigns_automation_status_idx
  on public.campaigns (automation_status);

create index if not exists campaigns_automation_locked_until_idx
  on public.campaigns (automation_locked_until);

notify pgrst, 'reload schema';
