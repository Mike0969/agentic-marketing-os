-- Split the Meta app keys into Facebook and Instagram (Mihai 2026-11-20: "how do I input Instagram and
-- Facebook when it is just one field?"). Instagram can say "use the same keys as Facebook"
-- (use_facebook, no keys of its own). Any old 'meta' row becomes the Facebook row. Safe to run repeatedly.

alter table social_app_keys drop constraint if exists social_app_keys_platform_check;
alter table social_app_keys drop constraint if exists social_app_keys_client_id_check;
alter table social_app_keys add column if not exists use_facebook boolean not null default false;
alter table social_app_keys alter column client_id drop not null;

update social_app_keys set platform = 'facebook'
where platform = 'meta' and not exists (select 1 from social_app_keys f where f.platform = 'facebook');
delete from social_app_keys where platform = 'meta';

alter table social_app_keys add constraint social_app_keys_platform_check
  check (platform in ('facebook', 'instagram', 'linkedin', 'x', 'tiktok'));
alter table social_app_keys add constraint social_app_keys_client_id_check
  check ((use_facebook and platform = 'instagram') or length(trim(coalesce(client_id, ''))) between 2 and 200);

notify pgrst, 'reload schema';
