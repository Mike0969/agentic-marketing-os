alter table public.content_items
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

notify pgrst, 'reload schema';
