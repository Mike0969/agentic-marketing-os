alter table public.content_items
  add column if not exists notified_at timestamptz;

create index if not exists idx_content_items_ready_notification
  on public.content_items (campaign_id, workflow_stage, notified_at)
  where workflow_stage = 'human_final_approval';

notify pgrst, 'reload schema';
