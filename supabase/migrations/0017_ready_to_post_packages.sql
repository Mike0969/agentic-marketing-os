alter table public.content_items
  add column if not exists ready_package jsonb;

create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references public.content_items(id) on delete cascade,
  kind text not null default 'image',
  url text,
  prompt text,
  position integer not null default 1,
  model text,
  provider text,
  status text not null default 'placeholder',
  error text,
  created_at timestamptz not null default now()
);

alter table public.content_assets
  drop constraint if exists content_assets_status_check;

alter table public.content_assets
  add constraint content_assets_status_check
  check (status in ('generated', 'placeholder', 'error'));

alter table public.content_assets
  drop constraint if exists content_assets_kind_check;

alter table public.content_assets
  add constraint content_assets_kind_check
  check (kind in ('image', 'carousel_slide', 'cover_frame', 'video_placeholder'));

create index if not exists content_assets_content_item_idx
  on public.content_assets (content_item_id, position);

insert into storage.buckets (id, name, public)
values ('marketing-assets', 'marketing-assets', true)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
