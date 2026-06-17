import type { SubAgentConfig } from "@/lib/agents/sub-agent-runner";

/**
 * Single source of truth for the specialist sub-agent configurations. Both the
 * individual /api/agents/<agent>/run routes and the parallel team runner import
 * from here so prompts, schemas, and deterministic fallbacks never drift.
 *
 * None of these agents may publish. Publishing is draft-only and excluded from
 * the automatic team fan-out.
 */

export type SubAgentKey =
  | "seo"
  | "content-creator"
  | "visual-video"
  | "competitor-intelligence"
  | "publishing"
  | "analytics";

export const subAgentConfigs: Record<SubAgentKey, SubAgentConfig> = {
  "content-creator": {
    agentId: "agent-content-creator",
    agentName: "Content Creator Agent",
    role: "Content Drafting Agent",
    task: "Draft platform content from brief",
    instructions:
      "Turn the provided Crina brief into platform-specific draft copy with hook and CTA variants. Drafts only — never publish or schedule.",
    brainFiles: ["brand-briefs.md", "voice-calendar-memory.md", "workflow-contract.md"],
    handoffFrom: "Crina",
    handoffTo: "Approval Queue",
    outputSchema: {
      agent: "Content Creator Agent",
      platform: "LinkedIn | X | Instagram | Facebook | Blog",
      drafts: [{ title: "string", hook: "string", body: "string", CTA: "string", variant: "string" }],
      status: "draft",
      notes: "string"
    },
    deterministicOutput: (raw) => {
      const brief = raw as { platform?: string; title?: string };
      return {
        agent: "Content Creator Agent",
        platform: brief.platform ?? "LinkedIn",
        drafts: [
          {
            title: brief.title ?? "Draft pending Hermes",
            hook: "Deterministic placeholder hook — Hermes was unavailable.",
            body: "This is an offline draft scaffold. Connect Hermes to generate real copy.",
            CTA: "Review in approval queue",
            variant: "fallback"
          }
        ],
        status: "draft",
        notes: "Deterministic fallback. No content was published."
      };
    }
  },
  seo: {
    agentId: "agent-seo",
    agentName: "SEO Agent",
    role: "Search Strategy Agent",
    task: "SEO themes and blog briefs",
    instructions:
      "Produce keyword themes, SERP angles, and a blog brief plus technical SEO recommendations. Analysis only — never publish.",
    brainFiles: ["brand-briefs.md", "content-intelligence-patterns.md", "workflow-contract.md"],
    handoffFrom: "Crina",
    handoffTo: "Content Creator Agent",
    outputSchema: {
      agent: "SEO Agent",
      keywordThemes: ["string"],
      serpAngles: ["string"],
      blogBrief: { title: "string", outline: ["string"], targetKeyword: "string" },
      technicalRecommendations: ["string"]
    },
    deterministicOutput: () => ({
      agent: "SEO Agent",
      keywordThemes: ["ai data center power", "ev ride hailing gcc"],
      serpAngles: ["Deterministic placeholder — Hermes unavailable."],
      blogBrief: { title: "Draft brief pending Hermes", outline: ["Intro", "Problem", "Solution", "CTA"], targetKeyword: "placeholder" },
      technicalRecommendations: ["Connect Hermes for real SEO analysis."]
    })
  },
  "visual-video": {
    agentId: "agent-visual-video",
    agentName: "Visual & Video Agent",
    role: "Creative Direction Agent",
    task: "Carousel and short-video concepts",
    instructions:
      "Create carousel concepts, short-video scripts, and storyboard briefs as creative direction for future generation. No image/video is produced or published here.",
    brainFiles: ["brand-briefs.md", "voice-calendar-memory.md", "draft-publishing-safety.md"],
    handoffFrom: "Content Creator Agent",
    handoffTo: "Approval Queue",
    outputSchema: {
      agent: "Visual & Video Agent",
      carouselConcepts: [{ title: "string", slides: ["string"] }],
      shortVideoScripts: [{ title: "string", beats: ["string"], durationSeconds: "number" }],
      storyboardBriefs: ["string"]
    },
    deterministicOutput: () => ({
      agent: "Visual & Video Agent",
      carouselConcepts: [{ title: "Draft concept pending Hermes", slides: ["Slide 1", "Slide 2", "Slide 3"] }],
      shortVideoScripts: [{ title: "Placeholder script", beats: ["Hook", "Proof", "CTA"], durationSeconds: 30 }],
      storyboardBriefs: ["Deterministic fallback — connect Hermes for creative direction."]
    })
  },
  "competitor-intelligence": {
    agentId: "agent-competitor-intelligence",
    agentName: "Competitor Intelligence Agent",
    role: "Market Pattern Intelligence Agent",
    task: "Competitor pattern analysis",
    instructions:
      "Identify winning-topic patterns and extract reusable hook skeletons and angles. Use competitor winners only as inspiration — never copy content. No publishing.",
    brainFiles: ["content-intelligence-patterns.md", "brand-briefs.md"],
    handoffFrom: "Crina",
    handoffTo: "SEO Agent",
    outputSchema: {
      agent: "Competitor Intelligence Agent",
      winningPatterns: [
        { hookSkeleton: "string", audiencePromise: "string", proofAngle: "string", CTA: "string", platformFit: "string", whyItWorked: "string", adaptFor: "string" }
      ]
    },
    deterministicOutput: () => ({
      agent: "Competitor Intelligence Agent",
      winningPatterns: [
        {
          hookSkeleton: "Deterministic placeholder — Hermes unavailable.",
          audiencePromise: "placeholder",
          proofAngle: "placeholder",
          CTA: "placeholder",
          platformFit: "LinkedIn",
          whyItWorked: "placeholder",
          adaptFor: "Connect Hermes for real competitor intelligence."
        }
      ]
    })
  },
  publishing: {
    agentId: "agent-publishing",
    agentName: "Publishing Agent",
    role: "Draft Packaging Agent",
    task: "Package approved content into platform draft",
    instructions:
      "Format already-approved content into a platform-ready DRAFT only. Prepare scheduling metadata suggestions. You must NEVER publish, schedule live, or post. Output is a draft package for human action.",
    brainFiles: ["draft-publishing-safety.md", "workflow-contract.md"],
    handoffFrom: "Approval Queue",
    handoffTo: "Human (manual posting)",
    outputSchema: {
      agent: "Publishing Agent",
      platform: "string",
      draftPackage: { title: "string", body: "string", formattedFor: "string", assets: ["string"] },
      suggestedScheduleMetadata: { suggestedTime: "string", timezone: "string" },
      readinessChecklist: ["string"],
      published: false,
      status: "draft"
    },
    deterministicOutput: (raw) => {
      const content = raw as { platform?: string; title?: string };
      return {
        agent: "Publishing Agent",
        platform: content.platform ?? "LinkedIn",
        draftPackage: {
          title: content.title ?? "Draft package pending Hermes",
          body: "Deterministic fallback draft. No content was published.",
          formattedFor: content.platform ?? "LinkedIn",
          assets: []
        },
        suggestedScheduleMetadata: { suggestedTime: "TBD", timezone: "Asia/Dubai" },
        readinessChecklist: ["Awaiting Hermes", "Human approval required", "Live posting disabled"],
        published: false,
        status: "draft"
      };
    }
  },
  analytics: {
    agentId: "agent-analytics",
    agentName: "Analytics Agent",
    role: "Marketing Performance Analyst",
    task: "Summarize marketing performance",
    instructions:
      "Summarize impressions, engagement, clicks, leads, top/weak content, and next-best actions into a concise executive report. No data exfiltration, no publishing.",
    brainFiles: ["voice-calendar-memory.md", "workflow-contract.md"],
    handoffFrom: "Publishing Agent",
    handoffTo: "Crina",
    outputSchema: {
      agent: "Analytics Agent",
      summary: "string",
      topContent: ["string"],
      weakContent: ["string"],
      nextBestActions: ["string"]
    },
    deterministicOutput: () => ({
      agent: "Analytics Agent",
      summary: "Deterministic fallback — Hermes unavailable. No live analytics retrieved.",
      topContent: [],
      weakContent: [],
      nextBestActions: ["Connect Hermes and integrations for real analytics."]
    })
  }
};

/**
 * Agents that run automatically in the parallel team fan-out (the "researchers
 * / drafters"). Publishing (draft-only, manual) and Analytics (needs live
 * integration data) are intentionally excluded from auto-runs.
 */
export const teamFanOutKeys: SubAgentKey[] = ["competitor-intelligence", "seo", "content-creator", "visual-video"];
