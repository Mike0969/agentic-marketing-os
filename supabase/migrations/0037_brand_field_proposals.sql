-- Proposed values for brand fields, waiting for the operator's review. Kept OUT of the
-- brands row on purpose: agents read the brands row, so unapproved text never reaches a
-- prompt. Brands shows each proposal in amber; "Use this" copies it into the field and
-- the operator's Save marks it accepted ("Dismiss" + Save marks it dismissed).
-- Safe to run repeatedly.

create table if not exists brand_field_proposals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  field text not null check (field in (
    'website', 'positioning', 'target_audience', 'tone_of_voice', 'pillars', 'seo_targets',
    'ctas', 'key_messages', 'proof_points', 'offers', 'competitors'
  )),
  value text not null,
  source text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- At most one open proposal per brand field.
create unique index if not exists brand_field_proposals_open_uniq
  on brand_field_proposals (brand_id, field) where status = 'proposed';

alter table brand_field_proposals enable row level security;
grant select, insert, update, delete on brand_field_proposals to authenticated;

drop policy if exists "admin read brand_field_proposals" on brand_field_proposals;
drop policy if exists "admin write brand_field_proposals" on brand_field_proposals;
create policy "admin read brand_field_proposals" on brand_field_proposals for select to authenticated using (public.is_admin());
create policy "admin write brand_field_proposals" on brand_field_proposals for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
