-- Seed real brand context for GridFactory.io and Gulf-EL.com / NexRide.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → paste → Run).
-- Idempotent: safe to re-run. Matches brands by name/website (case-insensitive).
-- Lists are comma-separated to match the Brands UI (splits on , ; and newlines).

begin;

-- GridFactory.io ------------------------------------------------------------
update public.brands set
  pillars         = 'GPU infrastructure, green energy data centers, modular design, European expansion',
  seo_targets     = 'GPU cloud provider, green data center Europe, modular data center, H100 H200 colocation',
  ctas            = 'Request capacity, Download investor deck, Book a site visit',
  approval_rules  = 'No financial claims without legal review. No unverified capacity numbers.'
where name ilike '%gridfactory%' or website ilike '%gridfactory%';

-- Gulf-EL.com / NexRide -----------------------------------------------------
update public.brands set
  pillars         = 'zero-commission ride-hailing, EV fleet, AI dispatch, GCC mobility',
  seo_targets     = 'ride-hailing GCC, EV taxi Dubai, zero commission driver app, tokenized loyalty transport',
  ctas            = 'Join as driver, Book a ride, Partner with us',
  approval_rules  = 'No pricing claims without ops confirmation. No market share claims.'
where name ilike '%gulf-el%' or name ilike '%gulf el%' or name ilike '%nexride%' or website ilike '%gulf-el%';

commit;

-- Verify ---------------------------------------------------------------------
select name, pillars, seo_targets, ctas, approval_rules
from public.brands
order by name;
