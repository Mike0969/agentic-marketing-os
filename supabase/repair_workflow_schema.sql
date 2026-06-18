-- Repair SQL for the staged Crina -> Content -> Crina -> Visual -> Crina workflow.
-- Safe to run multiple times in Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- Agent run observability columns used by Live Brain / Agent Brain.
alter table public.agent_runs add column if not exists agent_id text;
alter table public.agent_runs add column if not exists model text;
alter table public.agent_runs add column if not exists backup_model text;
alter table public.agent_runs add column if not exists tokens_prompt integer;
alter table public.agent_runs add column if not exists tokens_completion integer;
alter table public.agent_runs add column if not exists tokens_total integer;
alter table public.agent_runs add column if not exists duration_ms integer;
alter table public.agent_runs add column if not exists brain_resources_used jsonb;
alter table public.agent_runs add column if not exists handoff_from text;
alter table public.agent_runs add column if not exists handoff_to text;
alter table public.agent_runs add column if not exists provider_response_status integer;

-- Workflow columns used by Pipeline to show where a plan is sitting.
alter table public.content_items
  add column if not exists workflow_stage text,
  add column if not exists current_owner text,
  add column if not exists next_owner text,
  add column if not exists human_feedback_tags text[] default '{}',
  add column if not exists crina_review_notes text,
  add column if not exists agent_handoff_summary text,
  add column if not exists visual_asset_url text,
  add column if not exists visual_asset_prompt text,
  add column if not exists visual_asset_status text default 'not_requested',
  add column if not exists visual_asset_model text,
  add column if not exists visual_asset_error text;

alter table public.content_items
  drop constraint if exists content_items_visual_asset_status_check;

alter table public.content_items
  add constraint content_items_visual_asset_status_check
  check (
    visual_asset_status is null or visual_asset_status in (
      'not_requested',
      'generated',
      'placeholder',
      'error'
    )
  );

alter table public.content_items
  drop constraint if exists content_items_workflow_stage_check;

alter table public.content_items
  add constraint content_items_workflow_stage_check
  check (
    workflow_stage is null or workflow_stage in (
      'crina_plan_approval',
      'content_creation',
      'crina_content_review',
      'visual_creation',
      'crina_final_review',
      'human_final_approval',
      'publishing_prep',
      'scheduled',
      'rework',
      'done'
    )
  );

update public.content_items
set workflow_stage = case
    when approval_status = 'not_requested' and status in ('idea', 'brief') then 'crina_plan_approval'
    when approval_status = 'not_requested' and status = 'draft' then 'content_creation'
    when approval_status = 'not_requested' and status = 'visual' then 'crina_final_review'
    when approval_status = 'pending' then 'human_final_approval'
    when approval_status in ('rejected', 'changes_requested') then 'rework'
    when approval_status = 'approved' then 'done'
    else workflow_stage
  end,
  current_owner = case
    when approval_status = 'not_requested' and status in ('idea', 'brief') then 'Human'
    when approval_status = 'not_requested' and status = 'draft' then coalesce(assigned_agent, 'Content Creator Agent')
    when approval_status = 'not_requested' and status = 'visual' then 'Crina'
    when approval_status = 'pending' then 'Human'
    when approval_status in ('rejected', 'changes_requested') then 'Crina'
    when approval_status = 'approved' then 'Publishing Agent'
    else current_owner
  end,
  next_owner = case
    when approval_status = 'not_requested' and status in ('idea', 'brief') then 'Crina'
    when approval_status = 'not_requested' and status = 'draft' then 'Crina'
    when approval_status = 'not_requested' and status = 'visual' then 'Human'
    when approval_status = 'pending' then 'Publishing Agent'
    when approval_status in ('rejected', 'changes_requested') then 'Human'
    when approval_status = 'approved' then 'Archive'
    else next_owner
  end
where workflow_stage is null;

-- Feedback memory table. This is how rejected/change-request notes become future agent context.
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

alter table public.agent_learning_events add column if not exists content_item_id uuid;
alter table public.agent_learning_events add column if not exists brand_id uuid;
alter table public.agent_learning_events add column if not exists agent_id text;
alter table public.agent_learning_events add column if not exists agent_name text;
alter table public.agent_learning_events add column if not exists decision text;
alter table public.agent_learning_events add column if not exists feedback text not null default '';
alter table public.agent_learning_events add column if not exists tags text[] not null default '{}';
alter table public.agent_learning_events add column if not exists summary text not null default '';
alter table public.agent_learning_events add column if not exists created_at timestamptz not null default now();

update public.agent_learning_events set agent_name = 'Agent' where agent_name is null;
update public.agent_learning_events set decision = 'unknown' where decision is null;
alter table public.agent_learning_events alter column agent_name set not null;
alter table public.agent_learning_events alter column decision set not null;

alter table public.agent_learning_events enable row level security;

grant select, insert, update, delete on public.agent_learning_events to authenticated;

drop policy if exists "admin read agent learning events" on public.agent_learning_events;
drop policy if exists "admin write agent learning events" on public.agent_learning_events;

create policy "admin read agent learning events"
on public.agent_learning_events
for select
to authenticated
using (public.is_admin());

create policy "admin write agent learning events"
on public.agent_learning_events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists agent_learning_events_content_item_idx on public.agent_learning_events(content_item_id);
create index if not exists agent_learning_events_agent_idx on public.agent_learning_events(agent_id);
create index if not exists agent_learning_events_created_idx on public.agent_learning_events(created_at desc);

notify pgrst, 'reload schema';
