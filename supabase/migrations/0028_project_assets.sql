-- Project Asset Library: uploaded, reusable creative materials (images, video, carousels, decks,
-- scripts, notes) that express each project's taste/vision. Crina searches this FIRST and only
-- routes to the Visual Agent when nothing suitable exists. NOTE: this is distinct from the existing
-- `content_assets` table (0017), which holds per-post generated assets. This one is the durable,
-- project-scoped library.

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_slug text not null check (project_slug in ('gridfactory', 'gulf_el_nexride')),
  brand_id uuid references public.brands(id) on delete set null,
  file_url text,
  asset_type text not null default 'image'
    check (asset_type in ('image','video','carousel','deck','pdf','script','note','logo','reference','other')),
  title text not null default 'Untitled asset',
  description text,
  tags text[] not null default '{}',
  platform_fit text[] not null default '{all}',
  content_theme text,
  visual_style text,
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  reuse_allowed boolean not null default true,
  mandatory boolean not null default false,
  approved boolean not null default false,
  source_tool text not null default 'manual_upload'
    check (source_tool in ('manual_upload','google_flow','veo','higgsfield','sora','runway','canva','other')),
  rights_status text,
  transcript text,
  extracted_text text,
  used_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_assets_project_idx on public.project_assets (project_slug);
create index if not exists project_assets_brand_idx on public.project_assets (brand_id);
create index if not exists project_assets_approved_idx on public.project_assets (project_slug, approved, reuse_allowed);

alter table public.project_assets enable row level security;
drop policy if exists "project_assets admin read" on public.project_assets;
drop policy if exists "project_assets admin write" on public.project_assets;
create policy "project_assets admin read" on public.project_assets for select to authenticated using (public.is_admin());
create policy "project_assets admin write" on public.project_assets for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.project_assets to authenticated;

-- Track which asset was attached to which post + whether it was reused, so the Visual Agent can
-- avoid repeating the same asset on the same platform and Crina can log routing decisions.
create table if not exists public.project_asset_usages (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.project_assets(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  platform text,
  reused boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists project_asset_usages_asset_idx on public.project_asset_usages (asset_id);
create index if not exists project_asset_usages_platform_idx on public.project_asset_usages (asset_id, platform);

alter table public.project_asset_usages enable row level security;
drop policy if exists "project_asset_usages admin read" on public.project_asset_usages;
drop policy if exists "project_asset_usages admin write" on public.project_asset_usages;
create policy "project_asset_usages admin read" on public.project_asset_usages for select to authenticated using (public.is_admin());
create policy "project_asset_usages admin write" on public.project_asset_usages for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.project_asset_usages to authenticated;

notify pgrst, 'reload schema';
