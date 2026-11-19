-- LinkedIn: a brand can post as its Company Page (organization) instead of the connected member.
-- Set -> posts are authored by this organization (needs the w_organization_social scope and an
-- admin role on the page); empty -> posts go out as the connected member, as before.

alter table public.brands add column if not exists linkedin_organization_urn text;

alter table public.brands drop constraint if exists brands_linkedin_organization_urn_check;
alter table public.brands add constraint brands_linkedin_organization_urn_check
  check (linkedin_organization_urn is null or linkedin_organization_urn ~ '^urn:li:organization:[0-9]+$');

notify pgrst, 'reload schema';
