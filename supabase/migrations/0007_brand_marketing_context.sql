-- Richer brand context for agent planning and content quality.
-- Safe to run multiple times.

alter table public.brands add column if not exists content_pillars text;
alter table public.brands add column if not exists pillars text;
alter table public.brands add column if not exists key_messages text;
alter table public.brands add column if not exists proof_points text;
alter table public.brands add column if not exists offers text;
alter table public.brands add column if not exists competitors text;
alter table public.brands add column if not exists seo_targets text;
alter table public.brands add column if not exists approval_rules text;
alter table public.brands add column if not exists reusable_ctas text;
alter table public.brands add column if not exists ctas text;

update public.brands
set
  content_pillars = coalesce(content_pillars, 'AI power demand; grid constraints; data-center infrastructure; interconnection; bankability; power reliability'),
  pillars = coalesce(pillars, content_pillars, 'AI power demand; grid constraints; data-center infrastructure; interconnection; bankability; power reliability'),
  key_messages = coalesce(key_messages, 'AI growth needs credible power infrastructure. GridFactory focuses on the physical power layer behind durable data-center expansion.'),
  proof_points = coalesce(proof_points, 'Use only verified project, partner, technical, or market facts supplied by the team. Avoid unsupported MW, funding, or partnership claims.'),
  offers = coalesce(offers, 'Investor/infrastructure briefing; power readiness memo; site-readiness discussion'),
  competitors = coalesce(competitors, 'Data-center power infrastructure companies; grid interconnection commentary; energy infrastructure investment narratives'),
  seo_targets = coalesce(seo_targets, 'AI data center power infrastructure; data center grid constraints; power availability for AI compute; grid interconnection for data centers'),
  approval_rules = coalesce(approval_rules, 'Require approval for investor, technical, funding, partner, capacity, or project claims.'),
  reusable_ctas = coalesce(reusable_ctas, 'Request the infrastructure brief; Talk to us about AI power readiness; Review the investor-grade infrastructure thesis'),
  ctas = coalesce(ctas, reusable_ctas, 'Request the infrastructure brief; Talk to us about AI power readiness; Review the investor-grade infrastructure thesis')
where name = 'GridFactory.io';

update public.brands
set
  content_pillars = coalesce(content_pillars, 'GCC electric mobility; zero-commission ride-hailing; driver economics; AI dispatch; rider trust; tokenized loyalty'),
  pillars = coalesce(pillars, content_pillars, 'GCC electric mobility; zero-commission ride-hailing; driver economics; AI dispatch; rider trust; tokenized loyalty'),
  key_messages = coalesce(key_messages, 'NexRide is building a credible zero-commission mobility model for the GCC, combining electric mobility, AI operations, and loyalty infrastructure.'),
  proof_points = coalesce(proof_points, 'Use only verified launch, partner, app, driver, fleet, regulatory, or loyalty facts supplied by the team. Avoid unsupported availability claims.'),
  offers = coalesce(offers, 'Early access; driver/fleet partner interest; mobility partnership discussion; Gulf-EL model briefing'),
  competitors = coalesce(competitors, 'GCC ride-hailing platforms; EV fleet operators; zero-commission marketplaces; mobility loyalty programs'),
  seo_targets = coalesce(seo_targets, 'GCC electric mobility; zero commission ride hailing; AI ride hailing platform; EV fleet mobility GCC; driver economics ride hailing'),
  approval_rules = coalesce(approval_rules, 'Require approval for launch timing, commission, token/loyalty, regulatory, safety, partner, or availability claims.'),
  reusable_ctas = coalesce(reusable_ctas, 'Join the NexRide early access list; Register interest as a driver or fleet partner; Explore the Gulf-EL mobility model'),
  ctas = coalesce(ctas, reusable_ctas, 'Join the NexRide early access list; Register interest as a driver or fleet partner; Explore the Gulf-EL mobility model')
where name = 'Gulf-EL.com / NexRide';

notify pgrst, 'reload schema';
