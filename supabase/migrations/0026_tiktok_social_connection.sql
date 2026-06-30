-- T12: allow TikTok OAuth connections alongside LinkedIn, X, Facebook, and Instagram.

alter table public.social_connections drop constraint if exists social_connections_platform_check;
alter table public.social_connections
  add constraint social_connections_platform_check
  check (platform in ('linkedin', 'x', 'facebook', 'instagram', 'tiktok'));

notify pgrst, 'reload schema';
