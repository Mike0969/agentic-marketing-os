-- Funnel spine: after a lead is captured, enroll it in an email nurture sequence. A cron drip step
-- sends the due email via Resend and advances the lead toward the MLM-subscribe CTA. This is the
-- "marketing post -> email -> convert -> subscribe" middle that was missing.

create table if not exists public.lead_nurture (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  sequence_key text not null default 'default',
  step integer not null default 0,
  status text not null default 'active' check (status in ('active','completed','stopped','error')),
  next_send_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lead_nurture_lead_idx on public.lead_nurture (lead_id);
create index if not exists lead_nurture_due_idx on public.lead_nurture (status, next_send_at);

alter table public.lead_nurture enable row level security;
drop policy if exists "lead_nurture admin read" on public.lead_nurture;
drop policy if exists "lead_nurture admin write" on public.lead_nurture;
create policy "lead_nurture admin read" on public.lead_nurture for select to authenticated using (public.is_admin());
create policy "lead_nurture admin write" on public.lead_nurture for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.lead_nurture to authenticated;

-- Every send is logged (audit + idempotency + deliverability review).
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  brand_id uuid,
  to_email text not null,
  subject text,
  sequence_key text,
  step integer,
  provider_id text,
  status text not null default 'sent' check (status in ('sent','error')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists email_sends_lead_idx on public.email_sends (lead_id);

alter table public.email_sends enable row level security;
drop policy if exists "email_sends admin read" on public.email_sends;
drop policy if exists "email_sends admin write" on public.email_sends;
create policy "email_sends admin read" on public.email_sends for select to authenticated using (public.is_admin());
create policy "email_sends admin write" on public.email_sends for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.email_sends to authenticated;

notify pgrst, 'reload schema';
