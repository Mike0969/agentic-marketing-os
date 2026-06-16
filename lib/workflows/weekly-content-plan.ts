import { randomUUID } from "crypto";
import { seedData } from "@/lib/seed";
import type {
  Brand,
  DashboardData,
  GeneratedContentPlanItem,
  WeeklyContentPlanInput,
  WeeklyContentPlanOutput,
  WeeklyContentPlatform
} from "@/lib/types";

type BrandContext = {
  brand: Brand;
  campaignId: string;
  voice: string;
  cta: string;
  linkedinThemes: string[];
  xThemes: string[];
  blogIdea: string;
  carouselIdea: string;
  videoIdea: string;
};

const platformFallbacks: WeeklyContentPlatform[] = ["LinkedIn", "X", "Instagram", "Facebook", "Blog"];

export function generateWeeklyContentPlan(input: WeeklyContentPlanInput, data: DashboardData = seedData): WeeklyContentPlanOutput {
  const selectedBrands = getSelectedBrandContexts(input.brand, data);
  const items = selectedBrands.flatMap((context) => buildBrandPlan(context, input));

  return {
    workflowName: "Generate Weekly Content Plan",
    generatedBy: "Crina",
    weekStartDate: input.weekStartDate,
    summary: `Crina generated ${items.length} content ideas for ${selectedBrands.map((context) => context.brand.name).join(" and ")}. No items are scheduled or published automatically.`,
    items
  };
}

function getSelectedBrandContexts(selection: WeeklyContentPlanInput["brand"], data: DashboardData): BrandContext[] {
  const grid = data.brands.find((brand) => brand.id === "brand-gridfactory" || brand.name.toLowerCase().includes("gridfactory")) ?? seedData.brands[0];
  const gulf =
    data.brands.find((brand) => brand.id === "brand-gulf-el" || brand.name.toLowerCase().includes("gulf") || brand.name.toLowerCase().includes("nexride")) ??
    seedData.brands[1];

  const contexts: Record<"gridfactory" | "gulf-el", BrandContext> = {
    gridfactory: {
      brand: grid,
      campaignId: getCampaignId(data, grid.id, "campaign-grid-investor"),
      voice: "Institutional, infrastructure-focused, investor-grade, B2B.",
      cta: "Request an investor briefing",
      linkedinThemes: [
        "AI load growth is turning power availability into the core data-center underwriting question",
        "Why bankable grid capacity depends on interconnection, redundancy, and dispatchable supply",
        "How infrastructure investors can evaluate power-constrained AI campuses",
        "What utilities, developers, and data-center operators need from a power platform",
        "The difference between announced megawatts and financeable megawatts"
      ],
      xThemes: [
        "AI growth is now a grid-planning problem, not only a compute procurement problem",
        "Interconnection queues are becoming strategic infrastructure intelligence",
        "Investor diligence needs to move upstream to substations, congestion, and power quality",
        "Data-center power strategy rewards boring reliability over hype",
        "The next AI infrastructure winners may control electrons before buildings"
      ],
      blogIdea: "Data Center Power Infrastructure: The Investor Checklist for Bankable Capacity",
      carouselIdea: "Seven Signals That a Data-Center Power Site Is Financeable",
      videoIdea: "A 45-second executive explainer on why AI growth needs grid-first infrastructure"
    },
    "gulf-el": {
      brand: gulf,
      campaignId: getCampaignId(data, gulf.id, "campaign-nexride-launch"),
      voice: "Futuristic, mobility-focused, bold but credible.",
      cta: "Join the NexRide launch network",
      linkedinThemes: [
        "Why zero-commission ride-hailing can reset driver economics in the GCC",
        "How AI dispatch and EV fleets can make urban mobility more efficient",
        "Tokenized loyalty as infrastructure for repeat riders, drivers, and local partners",
        "The GCC is ready for a mobility platform built around EV adoption and fairness",
        "NexRide as a credible alternative to extractive marketplace economics"
      ],
      xThemes: [
        "Zero commission changes the ride-hailing equation for drivers and riders",
        "AI dispatch should reduce friction, not hide margin extraction",
        "EV mobility in the GCC needs better incentives and better trust",
        "Tokenized loyalty can make every ride part of a larger network",
        "NexRide is building for riders, drivers, fleets, and city-scale partners"
      ],
      blogIdea: "The GCC Mobility Stack: EV Ride-Hailing, AI Dispatch, and Tokenized Loyalty",
      carouselIdea: "How NexRide Aligns Riders, EV Drivers, Fleets, and Loyalty Partners",
      videoIdea: "A 30-second launch script showing one ride becoming a loyalty-powered EV mobility loop"
    }
  };

  if (selection === "both") return [contexts.gridfactory, contexts["gulf-el"]];
  return [contexts[selection]];
}

function getCampaignId(data: DashboardData, brandId: string, fallbackId: string) {
  return data.campaigns.find((campaign) => campaign.brand_id === brandId)?.id ?? fallbackId;
}

function buildBrandPlan(context: BrandContext, input: WeeklyContentPlanInput): GeneratedContentPlanItem[] {
  const notes = input.humanNotes.trim() ? ` Human direction: ${input.humanNotes.trim()}` : "";
  const objective = input.campaignObjective.trim() || context.brand.positioning;
  const audience = input.targetAudience.trim() || context.brand.target_audience;
  const selectedPlatforms = input.platforms.length > 0 ? input.platforms : platformFallbacks;

  const linkedinIdeas = context.linkedinThemes.map((theme, index) =>
    buildItem(context, {
      platform: "LinkedIn",
      contentType: "LinkedIn post idea",
      title: theme,
      hook: theme,
      body: `${context.voice} Frame this for ${audience}. Connect the idea to this weekly objective: ${objective}.${notes}`,
      cta: context.cta,
      assignedAgent: index === 0 ? "Crina" : "Content Creator Agent",
      status: input.contentIntensity === "light" ? "idea" : "brief"
    })
  );

  const xIdeas = context.xThemes.map((theme, index) =>
    buildItem(context, {
      platform: "X",
      contentType: "X post idea",
      title: theme,
      hook: theme,
      body: `${context.voice} Draft as a concise executive social post for ${audience}. Tie back to: ${objective}.${notes}`,
      cta: context.cta,
      assignedAgent: "Content Creator Agent",
      status: input.contentIntensity === "aggressive" && index < 2 ? "brief" : "idea"
    })
  );

  const blog = buildItem(context, {
    platform: "Blog",
    contentType: "Blog/article idea",
    title: context.blogIdea,
    hook: context.blogIdea,
    body: `${context.voice} Long-form article brief for ${audience}. Include thesis, proof points, objections, and commercial next step. Objective: ${objective}.${notes}`,
    cta: context.cta,
    assignedAgent: "SEO Agent",
    status: "brief"
  });

  const carouselPlatform = selectedPlatforms.includes("Instagram") ? "Instagram" : "LinkedIn";
  const carousel = buildItem(context, {
    platform: carouselPlatform,
    contentType: "Carousel concept",
    title: context.carouselIdea,
    hook: context.carouselIdea,
    body: `${context.voice} Create a 7-slide carousel concept with executive-grade slide titles, concise supporting copy, and one final approval-safe CTA.${notes}`,
    cta: context.cta,
    assignedAgent: "Visual & Video Agent",
    status: "brief"
  });

  const videoPlatform = selectedPlatforms.includes("Instagram") ? "Instagram" : selectedPlatforms.includes("Facebook") ? "Facebook" : "LinkedIn";
  const video = buildItem(context, {
    platform: videoPlatform,
    contentType: "Short video script idea",
    title: context.videoIdea,
    hook: context.videoIdea,
    body: `${context.voice} Script structure: opening tension, three visual beats, proof point, and CTA. Keep it human-review ready and never auto-published.${notes}`,
    cta: context.cta,
    assignedAgent: "Visual & Video Agent",
    status: "idea"
  });

  return [...linkedinIdeas, ...xIdeas, blog, carousel, video];
}

function buildItem(
  context: BrandContext,
  item: {
    platform: WeeklyContentPlatform;
    contentType: string;
    title: string;
    hook: string;
    body: string;
    cta: string;
    assignedAgent: string;
    status: "idea" | "brief";
  }
): GeneratedContentPlanItem {
  return {
    id: randomUUID(),
    brand_id: context.brand.id,
    brandName: context.brand.name,
    campaign_id: context.campaignId,
    platform: item.platform,
    content_type: item.contentType,
    title: item.title,
    hook: item.hook,
    body: item.body,
    CTA: item.cta,
    assigned_agent: item.assignedAgent,
    status: item.status
  };
}

// TODO: Add a Hermes-first execution path if this OS runs a local/owned agent runtime.
// TODO: Add OpenAI, Claude, and DeepSeek adapters with structured JSON output validation.
// TODO: Add optional n8n webhook dispatch for external workflow orchestration and notification chains.
// TODO: Add brand memory, competitor intelligence, and analytics feedback retrieval before generation.
