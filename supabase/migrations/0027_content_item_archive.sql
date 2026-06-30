-- Archive support for scheduled posts: "Remove from schedule" archives (recoverable) instead of
-- losing the package. Filtered out of active screens; a "view archived" surface comes later.

alter table public.content_items add column if not exists archived_at timestamptz;

create index if not exists idx_content_items_archived on public.content_items (archived_at);

notify pgrst, 'reload schema';
