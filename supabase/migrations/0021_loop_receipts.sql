-- CEO-agent loop receipts: one row per judged loop round (Content, Visual, ...). Evidence trail
-- for bounded scored loops — what the maker produced, Crina's rubric score, the decision, and why
-- the loop stopped. Powers the Agent Brain observability view and loop debriefs.

create table if not exists public.loop_receipts (
  id uuid primary key default gen_random_uuid(),
  loop_id uuid not null,
  loop_type text not null,                 -- 'content' | 'visual' | ...
  brand_id uuid references public.brands(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete cascade,
  agent_id text not null,                  -- the maker for this round
  round_number integer not null default 0,
  input_summary text,
  output_summary text,
  score_before integer,
  score_after integer,
  judge_notes text,
  decision text check (decision in ('pass', 'rework', 'fail', 'needs_human')),
  stop_reason text check (stop_reason in ('pass', 'max_rounds', 'no_progress', 'safety', 'error', 'needs_human')),
  fallback_used boolean not null default false,
  provider text,
  model text,
  tokens_prompt integer,
  tokens_completion integer,
  tokens_total integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_loop_receipts_loop on public.loop_receipts (loop_id, round_number);
create index if not exists idx_loop_receipts_brand on public.loop_receipts (brand_id, created_at desc);
create index if not exists idx_loop_receipts_item on public.loop_receipts (content_item_id);

alter table public.loop_receipts enable row level security;

drop policy if exists "loop_receipts admin read" on public.loop_receipts;
drop policy if exists "loop_receipts admin insert" on public.loop_receipts;

create policy "loop_receipts admin read" on public.loop_receipts for select to authenticated using (public.is_admin());
create policy "loop_receipts admin insert" on public.loop_receipts for insert to authenticated with check (public.is_admin());

grant select, insert on public.loop_receipts to authenticated;

notify pgrst, 'reload schema';
