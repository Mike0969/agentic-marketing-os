-- Social platform app keys managed from Settings (Mihai 2026-11-20: "where do I enter the new Meta /
-- LinkedIn keys"). One row per platform app: meta (Facebook + Instagram share one Meta app), linkedin,
-- x, tiktok. The client id is not secret; the client secret is AES-256-GCM encrypted with the server key
-- (only the last 4 characters are kept in clear). Env values still work; a row here takes priority.
-- Safe to run repeatedly.

create table if not exists social_app_keys (
  platform text primary key check (platform in ('meta', 'linkedin', 'x', 'tiktok')),
  client_id text not null check (length(trim(client_id)) between 2 and 200),
  client_secret_enc text,
  secret_last4 text not null default '',
  updated_at timestamptz not null default now()
);

alter table social_app_keys enable row level security;
grant select, insert, update, delete on social_app_keys to authenticated;
drop policy if exists "admin social_app_keys" on social_app_keys;
create policy "admin social_app_keys" on social_app_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
