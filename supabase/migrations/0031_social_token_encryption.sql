-- Social OAuth tokens are encrypted by the app (AES-256-GCM, key SOCIAL_TOKEN_ENCRYPTION_KEY)
-- before they are stored. Encrypted values start with 'enc:v1:'; legacy plaintext rows are still
-- readable and are re-encrypted the next time the app reads them with a key configured.
-- tokens_encrypted lets the operator see which rows are still plaintext.

alter table public.social_connections add column if not exists tokens_encrypted boolean not null default false;

update public.social_connections
set tokens_encrypted = coalesce(access_token like 'enc:v1:%', true) and coalesce(refresh_token like 'enc:v1:%', true)
where tokens_encrypted = false and (access_token like 'enc:v1:%' or refresh_token like 'enc:v1:%');

comment on column public.social_connections.access_token is 'App-encrypted (enc:v1:...) when SOCIAL_TOKEN_ENCRYPTION_KEY is set; legacy rows may be plaintext.';
comment on column public.social_connections.refresh_token is 'App-encrypted (enc:v1:...) when SOCIAL_TOKEN_ENCRYPTION_KEY is set; legacy rows may be plaintext.';

notify pgrst, 'reload schema';
