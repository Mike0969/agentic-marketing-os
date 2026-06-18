import type { Agent, Approval, Brand, Campaign, ContentItem, DashboardData } from "@/lib/types";

export const brands: Brand[] = [
  {
    id: "brand-gridfactory",
    name: "GridFactory.io",
    website: "https://gridfactory.io",
    positioning: "AI, grid, and data-center power infrastructure for investor-grade energy projects.",
    target_audience: "Data-center operators, infrastructure funds, utilities, energy developers, and strategic investors.",
    tone_of_voice: "Technical, sober, boardroom-ready, and commercially precise.",
    content_pillars: "AI power demand; grid constraints; data-center infrastructure; interconnection; bankability; power reliability.",
    key_messages: "AI growth needs credible power infrastructure. GridFactory focuses on the physical power layer behind durable data-center expansion.",
    proof_points: "Use only verified project, partner, technical, or market facts supplied by the team. Avoid unsupported MW, funding, or partnership claims.",
    offers: "Investor/infrastructure briefing; power readiness memo; site-readiness discussion.",
    competitors: "Data-center power infrastructure companies; grid interconnection commentary; energy infrastructure investment narratives.",
    seo_targets: "AI data center power infrastructure; data center grid constraints; power availability for AI compute; grid interconnection for data centers.",
    approval_rules: "Require approval for investor, technical, funding, partner, capacity, or project claims.",
    reusable_ctas: "Request the infrastructure brief; Talk to us about AI power readiness; Review the investor-grade infrastructure thesis.",
    active: true
  },
  {
    id: "brand-gulf-el",
    name: "Gulf-EL.com / NexRide",
    website: "https://gulf-el.com",
    positioning: "Electric mobility, zero-commission ride-hailing, AI dispatch, and tokenized loyalty for GCC transport.",
    target_audience: "GCC riders, EV drivers, fleet partners, regulators, loyalty partners, and mobility investors.",
    tone_of_voice: "Ambitious, clear, regionally fluent, tech-forward, and trust-building.",
    content_pillars: "GCC electric mobility; zero-commission ride-hailing; driver economics; AI dispatch; rider trust; tokenized loyalty.",
    key_messages: "NexRide is building a credible zero-commission mobility model for the GCC, combining electric mobility, AI operations, and loyalty infrastructure.",
    proof_points: "Use only verified launch, partner, app, driver, fleet, regulatory, or loyalty facts supplied by the team. Avoid unsupported availability claims.",
    offers: "Early access; driver/fleet partner interest; mobility partnership discussion; Gulf-EL model briefing.",
    competitors: "GCC ride-hailing platforms; EV fleet operators; zero-commission marketplaces; mobility loyalty programs.",
    seo_targets: "GCC electric mobility; zero commission ride hailing; AI ride hailing platform; EV fleet mobility GCC; driver economics ride hailing.",
    approval_rules: "Require approval for launch timing, commission, token/loyalty, regulatory, safety, partner, or availability claims.",
    reusable_ctas: "Join the NexRide early access list; Register interest as a driver or fleet partner; Explore the Gulf-EL mobility model.",
    active: true
  }
];

export const agents: Agent[] = [
  {
    id: "agent-crina",
    name: "Crina",
    role: "Marketing CEO Agent",
    description: "Hermes-first marketing CEO agent for strategy, channel orchestration, content planning, approval routing, and weekly executive reporting.",
    model_preference: "Hermes / GPT-5 / Claude Opus",
    status: "active",
    brand_scope: "All brands"
  },
  {
    id: "agent-seo",
    name: "SEO Agent",
    role: "Search Strategy",
    description: "Builds keyword clusters, technical SEO tasks, and search-intent briefs.",
    model_preference: "GPT-5",
    status: "active",
    brand_scope: "All brands"
  },
  {
    id: "agent-content",
    name: "Content Creator Agent",
    role: "Copy and Editorial",
    description: "Turns campaign briefs into posts, articles, email copy, hooks, and CTAs.",
    model_preference: "Claude Sonnet",
    status: "active",
    brand_scope: "All brands"
  },
  {
    id: "agent-visual",
    name: "Visual & Video Agent",
    role: "Creative Production",
    description: "Creates visual briefs, AI image/video prompts, storyboards, and asset specs.",
    model_preference: "GPT-5 + Sora",
    status: "standby",
    brand_scope: "All brands"
  },
  {
    id: "agent-competitor",
    name: "Competitor Intelligence Agent",
    role: "Market Monitoring",
    description: "Tracks competitor positioning, campaign signals, SERP movement, and industry narratives.",
    model_preference: "DeepSeek / GPT-5",
    status: "active",
    brand_scope: "All brands"
  },
  {
    id: "agent-publishing",
    name: "Publishing Agent",
    role: "Scheduling and Distribution",
    description: "Prepares channel-specific publishing packages and future social/API handoffs.",
    model_preference: "GPT-5 mini",
    status: "standby",
    brand_scope: "All brands"
  },
  {
    id: "agent-analytics",
    name: "Analytics Agent",
    role: "Performance Analysis",
    description: "Summarizes content performance, campaign ROI, and next-best actions.",
    model_preference: "GPT-5",
    status: "active",
    brand_scope: "All brands"
  }
];

export const campaigns: Campaign[] = [
  {
    id: "campaign-grid-investor",
    brand_id: "brand-gridfactory",
    title: "AI Grid Infrastructure Investor Narrative",
    objective: "Establish GridFactory as a credible platform for data-center power infrastructure investment.",
    target_audience: "Infrastructure funds, energy investors, hyperscale data-center partners.",
    status: "active",
    start_date: "2026-06-01",
    end_date: "2026-08-30"
  },
  {
    id: "campaign-nexride-launch",
    brand_id: "brand-gulf-el",
    title: "NexRide GCC Mobility Launch",
    objective: "Build market confidence for zero-commission EV ride-hailing and loyalty infrastructure.",
    target_audience: "Riders, EV drivers, fleet owners, local partners, and mobility investors.",
    status: "planning",
    start_date: "2026-06-10",
    end_date: "2026-09-15"
  }
];

export const contentItems: ContentItem[] = [
  {
    id: "content-grid-linkedin-1",
    brand_id: "brand-gridfactory",
    campaign_id: "campaign-grid-investor",
    platform: "LinkedIn",
    content_type: "Founder post",
    title: "Why AI Growth Is Becoming a Grid Infrastructure Problem",
    body: "AI demand is rewriting energy planning. GridFactory focuses on the power layer behind durable data-center growth.",
    hook: "The AI infrastructure bottleneck is no longer only chips.",
    CTA: "Book an investor briefing",
    status: "approval",
    assigned_agent: "Crina",
    approval_status: "pending",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  },
  {
    id: "content-grid-seo-1",
    brand_id: "brand-gridfactory",
    campaign_id: "campaign-grid-investor",
    platform: "Website",
    content_type: "SEO article",
    title: "Data Center Power Infrastructure: What Investors Need to Underwrite",
    body: "Long-form article outline covering power availability, interconnection queues, site selection, and revenue durability.",
    hook: "Data-center underwriting now starts at the substation.",
    CTA: "Download the infrastructure memo",
    status: "draft",
    assigned_agent: "SEO Agent",
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  },
  {
    id: "content-nexride-x-1",
    brand_id: "brand-gulf-el",
    campaign_id: "campaign-nexride-launch",
    platform: "X",
    content_type: "Thread",
    title: "Zero-Commission Ride-Hailing for the GCC",
    body: "A concise thread explaining how driver economics, EV fleets, and loyalty tokens can coexist.",
    hook: "Ride-hailing does not need to tax the driver to serve the rider.",
    CTA: "Join the launch waitlist",
    status: "brief",
    assigned_agent: "Content Creator Agent",
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  },
  {
    id: "content-nexride-video-1",
    brand_id: "brand-gulf-el",
    campaign_id: "campaign-nexride-launch",
    platform: "Instagram",
    content_type: "Short video",
    title: "From EV Driver to Loyalty Network",
    body: "15-second vertical explainer showing rider, EV driver, tokenized rewards, and city-scale mobility routing.",
    hook: "A ride can be more than a fare.",
    CTA: "Follow NexRide",
    status: "visual",
    assigned_agent: "Visual & Video Agent",
    approval_status: "not_requested",
    scheduled_at: null,
    published_at: null,
    performance_summary: null
  },
  {
    id: "content-grid-published-1",
    brand_id: "brand-gridfactory",
    campaign_id: "campaign-grid-investor",
    platform: "LinkedIn",
    content_type: "Carousel",
    title: "Five Signals of Bankable Grid Capacity",
    body: "Carousel summary for investor audience.",
    hook: "Not every megawatt is financeable.",
    CTA: "Review the site-readiness checklist",
    status: "published",
    assigned_agent: "Publishing Agent",
    approval_status: "approved",
    scheduled_at: "2026-06-14T09:00:00.000Z",
    published_at: "2026-06-14T09:00:00.000Z",
    performance_summary: "Mock: 18.4k impressions, 4.8% engagement, 36 investor clicks."
  },
  {
    id: "content-nexride-analyzed-1",
    brand_id: "brand-gulf-el",
    campaign_id: "campaign-nexride-launch",
    platform: "LinkedIn",
    content_type: "Market note",
    title: "Why GCC Mobility Needs Better Driver Economics",
    body: "Market note on EV adoption, commission structures, and trust.",
    hook: "The next mobility platform wins by aligning incentives.",
    CTA: "Talk to the NexRide team",
    status: "analyzed",
    assigned_agent: "Analytics Agent",
    approval_status: "approved",
    scheduled_at: "2026-06-12T08:30:00.000Z",
    published_at: "2026-06-12T08:30:00.000Z",
    performance_summary: "Mock: 11.2k impressions, 312 clicks, strong fleet-partner saves."
  }
];

export const approvals: Approval[] = [
  {
    id: "approval-grid-linkedin-1",
    content_item_id: "content-grid-linkedin-1",
    requested_by_agent: "Crina",
    decision: "pending",
    feedback: "",
    decided_at: null
  }
];

export const activity = [
  {
    id: "activity-1",
    label: "Crina requested approval",
    detail: "GridFactory LinkedIn founder post moved to approval.",
    timestamp: "Today, 09:10"
  },
  {
    id: "activity-2",
    label: "Analytics Agent summarized performance",
    detail: "NexRide market note produced strong fleet-partner intent signals.",
    timestamp: "Yesterday, 18:40"
  },
  {
    id: "activity-3",
    label: "SEO Agent drafted article",
    detail: "GridFactory investor SEO brief is ready for editorial expansion.",
    timestamp: "Yesterday, 14:20"
  }
];

export const seedData: DashboardData = {
  brands,
  agents,
  campaigns,
  contentItems,
  approvals,
  activity
};
