-- Email hardening: a global suppression list (unsubscribes, bounces, complaints, manual).
-- The nurture drip checks it before every send; unsubscribe links add to it.

create table if not exists public.email_suppressions (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  reason text not null check (reason in ('unsubscribe','bounce','complaint','manual')),
  source text not null default 'unknown',
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
drop policy if exists "email_suppressions admin read" on public.email_suppressions;
drop policy if exists "email_suppressions admin write" on public.email_suppressions;
create policy "email_suppressions admin read" on public.email_suppressions for select to authenticated using (public.is_admin());
create policy "email_suppressions admin write" on public.email_suppressions for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.email_suppressions to authenticated;

-- A skipped send to a suppressed address is logged too.
alter table public.email_sends drop constraint if exists email_sends_status_check;
alter table public.email_sends add constraint email_sends_status_check check (status in ('sent','error','suppressed'));

notify pgrst, 'reload schema';
