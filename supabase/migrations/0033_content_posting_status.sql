-- Live-posting state per content item, as real columns so the scheduler can filter in SQL
-- (before its page limit) and posts a platform is still processing are re-checked by the cron.
--   pending      may be posted when due (default; transient errors stay pending and retry)
--   processing   accepted by the platform (TikTok), re-checked until final
--   published    final
--   failed       final failure reported by the platform (not retried automatically)
--   unsupported  the platform cannot post this item type (e.g. TikTok text/image)

alter table public.content_items add column if not exists posting_status text not null default 'pending';
alter table public.content_items add column if not exists posting_ref text;

alter table public.content_items drop constraint if exists content_items_posting_status_check;
alter table public.content_items add constraint content_items_posting_status_check
  check (posting_status in ('pending','processing','published','failed','unsupported'));

update public.content_items set posting_status = 'published'
where status = 'published' and posting_status = 'pending';

create index if not exists content_items_due_posting_idx
  on public.content_items (status, posting_status, scheduled_at)
  where archived_at is null;

notify pgrst, 'reload schema';
