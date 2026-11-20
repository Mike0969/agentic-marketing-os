import type { AgentRun, Brand, Campaign, ContentItem } from "@/lib/types";

/**
 * What each agent does when Run is clicked on the Agents board: one real,
 * role-specific job (not a reachability ping). Nothing here posts, sends,
 * schedules or generates paid media; the Publishing agent only prepares a
 * package, and the Visual agent reports the image key it needs.
 */

export type BoardContext = {
  brands: Brand[];
  campaigns: Campaign[];
  contentItems: ContentItem[];
  recentRuns: AgentRun[];
};

export type BoardTask = {
  task: string;
  instructions: string;
  outputSchema: Record<string, unknown>;
  input: (ctx: BoardContext) => Record<string, unknown>;
  /** Prefix forced onto the summary (e.g. Publishing: "Prepared, not posted"). */
  summaryPrefix?: string;
  /** Any one of these env vars unlocks the agent's full job; none set -> needs_key. */
  needsAnyKey?: { label: string; envKeys: string[] };
};

const SAFETY = "Do not post, publish, schedule, send email/SMS, or claim anything was posted. Output is a draft for human review.";

function brandBrief(brands: Brand[]) {
  return brands.map((brand) => ({
    name: brand.name,
    positioning: brand.positioning,
    audience: brand.target_audience,
    pillars: brand.pillars ?? brand.content_pillars,
    seoTargets: brand.seo_targets,
    ctas: brand.ctas ?? brand.reusable_ctas
  }));
}

function campaignBrief(campaigns: Campaign[]) {
  return campaigns
    .filter((campaign) => !campaign.archived_at)
    .slice(0, 8)
    .map((campaign) => ({ title: campaign.title, objective: campaign.objective, audience: campaign.target_audience, status: campaign.status }));
}

function latestOutput(runs: AgentRun[], agentId: string) {
  const run = runs.find((item) => item.agent_id === agentId && item.status === "success" && item.output);
  return run?.output ?? null;
}

const summary = "One sentence describing what you produced.";

export const boardTasks: Record<string, BoardTask> = {
  "agent-crina": {
    task: "Weekly marketing priorities",
    instructions: `Set this week's marketing priorities across the brands and open campaigns, and delegate one task to each specialist agent. ${SAFETY}`,
    outputSchema: { summary, priorities: ["3 concrete priorities for this week"], delegations: [{ agent: "agent name", task: "one task" }] },
    input: (ctx) => ({ brands: brandBrief(ctx.brands), openCampaigns: campaignBrief(ctx.campaigns) })
  },
  "agent-seo": {
    task: "SEO keyword brief",
    instructions: `Write a keyword brief for the main brand: target keywords with search intent, and one article idea that wins the top keyword. ${SAFETY}`,
    outputSchema: { summary, keywords: [{ term: "keyword", intent: "informational|commercial|navigational|transactional" }], articleIdea: { title: "title", outline: ["section headings"] } },
    input: (ctx) => ({ brands: brandBrief(ctx.brands), openCampaigns: campaignBrief(ctx.campaigns) })
  },
  "agent-content-creator": {
    task: "Draft one social post",
    instructions: `Draft one ready-to-review LinkedIn post for the main brand, tied to an open campaign if there is one. ${SAFETY}`,
    outputSchema: { summary, platform: "LinkedIn", hook: "first line", body: "post body", cta: "call to action", hashtags: ["3-5 hashtags"] },
    input: (ctx) => ({ brands: brandBrief(ctx.brands), openCampaigns: campaignBrief(ctx.campaigns) })
  },
  "agent-visual-video": {
    task: "Carousel concept and image prompts",
    instructions: `Create a 4-slide carousel concept for the main brand: per slide a headline and an image-generation prompt, plus a 15-second short-video storyboard. Do not render images. ${SAFETY}`,
    outputSchema: { summary, slides: [{ headline: "slide headline", imagePrompt: "prompt for an image model" }], videoStoryboard: ["shot-by-shot beats"] },
    input: (ctx) => ({ brands: brandBrief(ctx.brands), openCampaigns: campaignBrief(ctx.campaigns) }),
    needsAnyKey: { label: "an image generation key (OPENAI_API_KEY, HUGGINGFACE_API_KEY or REPLICATE_API_TOKEN)", envKeys: ["OPENAI_API_KEY", "HUGGINGFACE_API_KEY", "REPLICATE_API_TOKEN"] }
  },
  "agent-competitor-intelligence": {
    task: "Competitor positioning scan",
    instructions: `From your knowledge of the brand's market, name the main competitor types, the hooks they use, and the gaps this brand can own. Say where live data would change the picture; never invent metrics. ${SAFETY}`,
    outputSchema: { summary, competitors: [{ name: "competitor or competitor type", hook: "what they lead with" }], gaps: ["positioning gaps this brand can own"] },
    input: (ctx) => ({ brands: brandBrief(ctx.brands) })
  },
  "agent-publishing": {
    task: "Prepare a post package (not posted)",
    instructions: `Package the latest draft into a ready-to-post package for human approval: platform, final caption, hashtags, best posting window and a pre-flight checklist. Posting is OFF; you never post. If there is no draft, package a short post for the main brand. ${SAFETY}`,
    outputSchema: { summary, platform: "platform", caption: "final caption", hashtags: ["hashtags"], postingWindow: "suggested day/time", checklist: ["pre-flight checks before a human approves"] },
    input: (ctx) => ({
      brands: brandBrief(ctx.brands),
      latestDraft:
        latestOutput(ctx.recentRuns, "agent-content-creator") ??
        ctx.contentItems.find((item) => !item.archived_at && item.status !== "published") ??
        null
    }),
    summaryPrefix: "Prepared, not posted"
  },
  "agent-conversion": {
    task: "Conversion review",
    instructions: `Review the brand's CTAs and campaigns and rank the three changes most likely to raise lead conversion, each with the funnel stage it fixes. ${SAFETY}`,
    outputSchema: { summary, recommendations: [{ change: "what to change", stage: "awareness|consideration|decision", why: "reason" }] },
    input: (ctx) => ({ brands: brandBrief(ctx.brands), openCampaigns: campaignBrief(ctx.campaigns) })
  },
  "agent-analytics": {
    task: "Operations analytics report",
    instructions: `Analyse the Marketing OS activity snapshot (counts are real, from the database) and report what is working, what is stuck and the next action. External sources (Search Console, social insights) are not connected; say so and do not invent numbers. ${SAFETY}`,
    outputSchema: { summary, findings: ["3 findings grounded in the snapshot"], nextAction: "one next action" },
    input: (ctx) => {
      const count = <T,>(items: T[], key: (item: T) => string) =>
        items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + 1 }), {});
      return {
        brands: ctx.brands.map((brand) => brand.name),
        campaignsByStatus: count(ctx.campaigns, (campaign) => campaign.status),
        contentByStatus: count(ctx.contentItems, (item) => item.status),
        recentAgentRunsByStatus: count(ctx.recentRuns, (run) => run.status),
        recentAgentRunsByAgent: count(ctx.recentRuns, (run) => run.agent_name)
      };
    }
  }
};

export function missingKey(task: BoardTask, env: Record<string, string | undefined> = process.env) {
  if (!task.needsAnyKey) return null;
  return task.needsAnyKey.envKeys.some((key) => Boolean(env[key]?.trim())) ? null : task.needsAnyKey.label;
}
