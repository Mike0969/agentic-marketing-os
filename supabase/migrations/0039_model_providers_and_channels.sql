-- Settings → Models and Notifications managed from the UI (admin 2026-11-20: "look like are hard coded").
-- Keys/tokens are encrypted at rest (AES-256-GCM with the server-held SOCIAL_TOKEN_ENCRYPTION_KEY, bound to
-- the row id + field); only the last 4 characters are kept in clear for display. Admin-only.
-- Env keys keep working as read-only "from server environment"; a UI row of the same kind takes priority.
-- Safe to run repeatedly.

create table if not exists model_providers (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('openai', 'anthropic', 'deepseek', 'openrouter', 'gemini', 'custom')),
  name text not null check (length(trim(name)) between 1 and 80),
  base_url text,
  api_key_enc text not null,
  key_last4 text not null default '',
  enabled boolean not null default true,
  models_cache jsonb not null default '[]'::jsonb,
  models_cached_at timestamptz,
  last_test_ok boolean,
  last_test_at timestamptz,
  last_test_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint model_providers_custom_base_url check (kind <> 'custom' or (base_url is not null and base_url ~ '^https?://'))
);

create table if not exists notification_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('telegram', 'slack')),
  name text not null check (length(trim(name)) between 1 and 80),
  token_enc text not null,
  token_last4 text not null default '',
  channel_id text not null check (length(trim(channel_id)) between 1 and 200),
  enabled boolean not null default true,
  last_test_ok boolean,
  last_test_at timestamptz,
  last_test_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table model_providers enable row level security;
alter table notification_channels enable row level security;
grant select, insert, update, delete on model_providers, notification_channels to authenticated;
drop policy if exists "admin model_providers" on model_providers;
drop policy if exists "admin notification_channels" on notification_channels;
create policy "admin model_providers" on model_providers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin notification_channels" on notification_channels for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
