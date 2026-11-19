-- Fair rotation for live posting. Every publish attempt (scheduler) and every status re-check
-- (TikTok reconciliation) stamps posting_last_attempt_at; both queues take never-tried rows first,
-- then the least recently tried. Rows that keep failing (no connection, dead token) therefore
-- rotate to the back instead of monopolising every run.

alter table public.content_items add column if not exists posting_last_attempt_at timestamptz;

create index if not exists content_items_posting_rotation_idx
  on public.content_items (posting_status, posting_last_attempt_at nulls first, scheduled_at)
  where archived_at is null;

notify pgrst, 'reload schema';
