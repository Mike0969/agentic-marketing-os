-- T11: social account connections for controlled, operator-approved live posting.
-- Tokens are secrets: admin-only RLS, server-side (service-role) access. Plaintext for v1;
-- column-level encryption is a follow-up. One connection per (brand, platform).

create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null check (platform in ('linkedin', 'x', 'facebook', 'instagram')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  author_urn text,
  scopes text,
  status text not null default 'connected' check (status in ('connected', 'expired', 'revoked')),
  connected_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_social_connections_brand_platform on public.social_connections (brand_id, platform);

alter table public.social_connections enable row level security;

drop policy if exists "social_connections admin read" on public.social_connections;
drop policy if exists "social_connections admin write" on public.social_connections;

create policy "social_connections admin read" on public.social_connections for select to authenticated using (public.is_admin());
create policy "social_connections admin write" on public.social_connections for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.social_connections to authenticated;

notify pgrst, 'reload schema';
