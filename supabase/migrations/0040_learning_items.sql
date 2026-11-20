-- Learning library (admin 2026-11-20): reference materials the agents read before working: images, ideas
-- (text), podcast / YouTube links (link + optional transcript, never a media download), documents, web links.
-- brand_id null = for all brands. used_by_agents=false keeps an item stored but out of the prompts.
-- Safe to run repeatedly.

create table if not exists learning_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  item_type text not null check (item_type in ('image', 'idea', 'podcast', 'youtube', 'document', 'link')),
  title text not null check (length(trim(title)) between 1 and 200),
  tags text[] not null default '{}',
  url text,
  file_path text,
  notes text not null default '',
  used_by_agents boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_items_link_types check (item_type not in ('podcast', 'youtube', 'link') or url ~ '^https?://'),
  constraint learning_items_idea_text check (item_type <> 'idea' or length(trim(notes)) > 0)
);
create index if not exists learning_items_brand_idx on learning_items (brand_id, used_by_agents);

alter table learning_items enable row level security;
grant select, insert, update, delete on learning_items to authenticated;
drop policy if exists "admin learning_items" on learning_items;
create policy "admin learning_items" on learning_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
