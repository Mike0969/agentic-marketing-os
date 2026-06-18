-- Inter-agent signals / escalations. Agents raise these (out of tokens, needs
-- media budget, high-value hook found, needs bigger model, error, fallback);
-- they route to Crina and surface for human decision. Safe to run repeatedly.

create table if not exists agent_signals (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  agent_name text not null,
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'ack', 'resolved', 'needs_approval')),
  run_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists agent_signals_status_idx on agent_signals (status, created_at desc);

alter table agent_signals enable row level security;
grant select, insert, update, delete on agent_signals to authenticated;

drop policy if exists "admin read agent_signals" on agent_signals;
drop policy if exists "admin write agent_signals" on agent_signals;
create policy "admin read agent_signals" on agent_signals for select to authenticated using (public.is_admin());
create policy "admin write agent_signals" on agent_signals for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
