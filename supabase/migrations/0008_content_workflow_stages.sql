alter table public.content_items
  add column if not exists workflow_stage text,
  add column if not exists current_owner text,
  add column if not exists next_owner text,
  add column if not exists human_feedback_tags text[] default '{}',
  add column if not exists crina_review_notes text,
  add column if not exists agent_handoff_summary text;

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
    when approval_status = 'pending' then 'human_final_approval'
    when approval_status in ('rejected', 'changes_requested') then 'rework'
    when approval_status = 'approved' then 'done'
    else workflow_stage
  end,
  current_owner = case
    when approval_status = 'not_requested' and status in ('idea', 'brief') then 'Human'
    when approval_status = 'pending' then 'Human'
    when approval_status in ('rejected', 'changes_requested') then 'Crina'
    when approval_status = 'approved' then 'Publishing Agent'
    else current_owner
  end
where workflow_stage is null;
