insert into brands (id, name, website, positioning, target_audience, tone_of_voice, active)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'GridFactory.io',
    'https://gridfactory.io',
    'AI, grid, and data-center power infrastructure for investor-grade energy projects.',
    'Data-center operators, infrastructure funds, utilities, energy developers, and strategic investors.',
    'Technical, sober, boardroom-ready, and commercially precise.',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Gulf-EL.com / NexRide',
    'https://gulf-el.com',
    'Electric mobility, zero-commission ride-hailing, AI dispatch, and tokenized loyalty for GCC transport.',
    'GCC riders, EV drivers, fleet partners, regulators, loyalty partners, and mobility investors.',
    'Ambitious, clear, regionally fluent, tech-forward, and trust-building.',
    true
  )
on conflict (id) do update set
  name = excluded.name,
  website = excluded.website,
  positioning = excluded.positioning,
  target_audience = excluded.target_audience,
  tone_of_voice = excluded.tone_of_voice,
  active = excluded.active;

insert into agents (id, name, role, description, model_preference, status, brand_scope)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'Crina', 'Marketing CEO Agent', 'Owns strategy, channel orchestration, approval routing, and weekly executive reporting.', 'GPT-5 / Claude Opus / Hermes', 'active', 'All brands'),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'SEO Agent', 'Search Strategy', 'Builds keyword clusters, technical SEO tasks, and search-intent briefs.', 'GPT-5', 'active', 'All brands'),
  ('aaaaaaaa-0003-4000-8000-000000000003', 'Content Creator Agent', 'Copy and Editorial', 'Turns campaign briefs into posts, articles, email copy, hooks, and CTAs.', 'Claude Sonnet', 'active', 'All brands'),
  ('aaaaaaaa-0004-4000-8000-000000000004', 'Visual & Video Agent', 'Creative Production', 'Creates visual briefs, AI image/video prompts, storyboards, and asset specs.', 'GPT-5 + Sora', 'standby', 'All brands'),
  ('aaaaaaaa-0005-4000-8000-000000000005', 'Competitor Intelligence Agent', 'Market Monitoring', 'Tracks competitor positioning, campaign signals, SERP movement, and industry narratives.', 'DeepSeek / GPT-5', 'active', 'All brands'),
  ('aaaaaaaa-0006-4000-8000-000000000006', 'Publishing Agent', 'Scheduling and Distribution', 'Prepares channel-specific publishing packages and future social/API handoffs.', 'GPT-5 mini', 'standby', 'All brands'),
  ('aaaaaaaa-0007-4000-8000-000000000007', 'Analytics Agent', 'Performance Analysis', 'Summarizes content performance, campaign ROI, and next-best actions.', 'GPT-5', 'active', 'All brands')
on conflict (id) do update set
  name = excluded.name,
  role = excluded.role,
  description = excluded.description,
  model_preference = excluded.model_preference,
  status = excluded.status,
  brand_scope = excluded.brand_scope;

insert into campaigns (id, brand_id, title, objective, target_audience, status, start_date, end_date)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'AI Grid Infrastructure Investor Narrative',
    'Establish GridFactory as a credible platform for data-center power infrastructure investment.',
    'Infrastructure funds, energy investors, hyperscale data-center partners.',
    'active',
    '2026-06-01',
    '2026-08-30'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'NexRide GCC Mobility Launch',
    'Build market confidence for zero-commission EV ride-hailing and loyalty infrastructure.',
    'Riders, EV drivers, fleet owners, local partners, and mobility investors.',
    'planning',
    '2026-06-10',
    '2026-09-15'
  )
on conflict (id) do update set
  brand_id = excluded.brand_id,
  title = excluded.title,
  objective = excluded.objective,
  target_audience = excluded.target_audience,
  status = excluded.status,
  start_date = excluded.start_date,
  end_date = excluded.end_date;

insert into content_items (
  id, brand_id, campaign_id, platform, content_type, title, body, hook, "CTA",
  status, assigned_agent, approval_status, scheduled_at, published_at, performance_summary
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'LinkedIn',
    'Founder post',
    'Why AI Growth Is Becoming a Grid Infrastructure Problem',
    'AI demand is rewriting energy planning. GridFactory focuses on the power layer behind durable data-center growth.',
    'The AI infrastructure bottleneck is no longer only chips.',
    'Book an investor briefing',
    'approval',
    'Crina',
    'pending',
    null,
    null,
    null
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'LinkedIn',
    'Market note',
    'Why GCC Mobility Needs Better Driver Economics',
    'Market note on EV adoption, commission structures, and trust.',
    'The next mobility platform wins by aligning incentives.',
    'Talk to the NexRide team',
    'analyzed',
    'Analytics Agent',
    'approved',
    '2026-06-12T08:30:00.000Z',
    '2026-06-12T08:30:00.000Z',
    'Mock: 11.2k impressions, 312 clicks, strong fleet-partner saves.'
  )
on conflict (id) do update set
  brand_id = excluded.brand_id,
  campaign_id = excluded.campaign_id,
  platform = excluded.platform,
  content_type = excluded.content_type,
  title = excluded.title,
  body = excluded.body,
  hook = excluded.hook,
  "CTA" = excluded."CTA",
  status = excluded.status,
  assigned_agent = excluded.assigned_agent,
  approval_status = excluded.approval_status,
  scheduled_at = excluded.scheduled_at,
  published_at = excluded.published_at,
  performance_summary = excluded.performance_summary;

insert into approvals (id, content_item_id, requested_by_agent, decision, feedback, decided_at)
values
  (
    '77777777-7777-4777-8777-777777777777',
    '55555555-5555-4555-8555-555555555555',
    'Crina',
    'pending',
    '',
    null
  )
on conflict (id) do update set
  content_item_id = excluded.content_item_id,
  requested_by_agent = excluded.requested_by_agent,
  decision = excluded.decision,
  feedback = excluded.feedback,
  decided_at = excluded.decided_at;
