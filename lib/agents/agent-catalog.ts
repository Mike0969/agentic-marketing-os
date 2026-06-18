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
      "Turn the provided Crina, SEO, or competitor brief into platform-specific draft copy with hook and CTA variants. Include claim-review notes, useful body copy, and visual opportunities. Drafts only — never publish or schedule.",
    brainFiles: [
      "brand-briefs.md",
      "brand-voice.md",
      "voice-calendar-memory.md",
      "winning-hooks.md",
      "weak-hooks.md",
      "content-formulas.md",
      "reusable-ctas.md",
      "approval-rules.md",
      "workflow-contract.md",
      "agent-content-creator-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Crina",
    handoffTo: "Approval Queue",
    outputSchema: {
      agent: "Content Creator Agent",
      platform: "LinkedIn | X | Instagram | Facebook | TikTok | YouTube | Blog",
      drafts: [{ title: "string", hook: "string", body: "string", CTA: "string", variant: "primary | sharper | conservative", claimsToReview: ["string"] }],
      visualOpportunities: ["string"],
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
            variant: "fallback",
            claimsToReview: ["Fallback draft; human review required."]
          }
        ],
        visualOpportunities: ["Create a simple proof-led carousel after Hermes is available."],
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
      "Produce keyword themes, search intent, SERP angles, and a blog brief plus technical SEO recommendations. Label recommendations without real Search Console data as strategic hypotheses. Analysis only — never publish.",
    brainFiles: [
      "brand-briefs.md",
      "brand-voice.md",
      "seo-targets.md",
      "content-intelligence-patterns.md",
      "approval-rules.md",
      "workflow-contract.md",
      "agent-seo-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Crina",
    handoffTo: "Content Creator Agent",
    outputSchema: {
      agent: "SEO Agent",
      brandName: "string",
      searchObjective: "string",
      keywordThemes: [{ theme: "string", intent: "informational | commercial | navigational | transactional", priority: "high | medium | low", rationale: "string" }],
      serpAngles: ["string"],
      blogBrief: { title: "string", outline: ["string"], targetKeyword: "string", audience: "string", proofNeeded: ["string"], internalLinks: ["string"], cta: "string" },
      technicalRecommendations: ["string"],
      handoffTo: "Content Creator Agent"
    },
    deterministicOutput: () => ({
      agent: "SEO Agent",
      brandName: "Unknown brand",
      searchObjective: "Create a searchable content brief.",
      keywordThemes: [{ theme: "ai data center power", intent: "commercial", priority: "medium", rationale: "Fallback hypothesis." }],
      serpAngles: ["Deterministic placeholder — Hermes unavailable."],
      blogBrief: {
        title: "Draft brief pending Hermes",
        outline: ["Intro", "Problem", "Solution", "CTA"],
        targetKeyword: "placeholder",
        audience: "Marketing reviewer",
        proofNeeded: ["Real source context"],
        internalLinks: [],
        cta: "Review the fallback brief"
      },
      technicalRecommendations: ["Connect Hermes for real SEO analysis."],
      handoffTo: "Content Creator Agent"
    })
  },
  "visual-video": {
    agentId: "agent-visual-video",
    agentName: "Visual & Video Agent",
    role: "Creative Direction Agent",
    task: "Carousel and short-video concepts",
    instructions:
      "Create carousel concepts, short-video scripts, storyboard briefs, and asset notes as creative direction for future generation. Do not claim media was generated. No image/video is produced or published here.",
    brainFiles: [
      "brand-briefs.md",
      "brand-voice.md",
      "content-formulas.md",
      "approval-rules.md",
      "voice-calendar-memory.md",
      "draft-publishing-safety.md",
      "agent-visual-video-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Content Creator Agent",
    handoffTo: "Approval Queue",
    outputSchema: {
      agent: "Visual & Video Agent",
      carouselConcepts: [{ title: "string", slides: [{ slide: "number", headline: "string", visualDirection: "string", supportingCopy: "string" }] }],
      shortVideoScripts: [{ title: "string", beats: ["string"], durationSeconds: "number", onScreenText: ["string"], voiceover: "string" }],
      storyboardBriefs: ["string"],
      assetNotes: ["string"]
    },
    deterministicOutput: () => ({
      agent: "Visual & Video Agent",
      carouselConcepts: [{ title: "Draft concept pending Hermes", slides: [{ slide: 1, headline: "Fallback visual direction", visualDirection: "Simple proof-led graphic", supportingCopy: "Human review required." }] }],
      shortVideoScripts: [{ title: "Placeholder script", beats: ["Hook", "Proof", "CTA"], durationSeconds: 30, onScreenText: ["Fallback"], voiceover: "Connect Hermes for creative direction." }],
      storyboardBriefs: ["Deterministic fallback — connect Hermes for creative direction."],
      assetNotes: ["No assets generated."]
    })
  },
  "competitor-intelligence": {
    agentId: "agent-competitor-intelligence",
    agentName: "Competitor Intelligence Agent",
    role: "Market Pattern Intelligence Agent",
    task: "Competitor pattern analysis",
    instructions:
      "Identify winning-topic patterns and extract reusable hook skeletons, angles, platform fit, and risk notes. Use competitor winners only as inspiration — never copy content. No publishing.",
    brainFiles: [
      "content-intelligence-patterns.md",
      "competitor-references.md",
      "winning-hooks.md",
      "weak-hooks.md",
      "brand-briefs.md",
      "brand-voice.md",
      "agent-competitor-intelligence-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Crina",
    handoffTo: "SEO Agent",
    outputSchema: {
      agent: "Competitor Intelligence Agent",
      winningPatterns: [
        { sourceLabel: "string", hookSkeleton: "string", audiencePromise: "string", proofAngle: "string", CTA: "string", platformFit: "string", whyItWorked: "string", adaptFor: "string", riskNotes: ["string"] }
      ],
      recommendedAngles: ["string"],
      handoffTo: "SEO Agent"
    },
    deterministicOutput: () => ({
      agent: "Competitor Intelligence Agent",
      winningPatterns: [
        {
          hookSkeleton: "Deterministic placeholder — Hermes unavailable.",
          sourceLabel: "fallback",
          audiencePromise: "placeholder",
          proofAngle: "placeholder",
          CTA: "placeholder",
          platformFit: "LinkedIn",
          whyItWorked: "placeholder",
          adaptFor: "Connect Hermes for real competitor intelligence.",
          riskNotes: ["No real competitor source was analyzed."]
        }
      ],
      recommendedAngles: ["Run Hermes with competitor or topic context."],
      handoffTo: "SEO Agent"
    })
  },
  publishing: {
    agentId: "agent-publishing",
    agentName: "Publishing Agent",
    role: "Draft Packaging Agent",
    task: "Package approved content into platform draft",
    instructions:
      "Format already-approved content into a platform-ready DRAFT only. Prepare hashtags, alt text, asset notes, checklist, and scheduling metadata suggestions. You must NEVER publish, schedule live, or post. Output is a draft package for human action.",
    brainFiles: [
      "draft-publishing-safety.md",
      "workflow-contract.md",
      "approval-rules.md",
      "reusable-ctas.md",
      "brand-voice.md",
      "agent-publishing-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Approval Queue",
    handoffTo: "Human (manual posting)",
    outputSchema: {
      agent: "Publishing Agent",
      platform: "string",
      draftPackage: { title: "string", body: "string", formattedFor: "string", hashtags: ["string"], assetNotes: ["string"], altText: "string" },
      suggestedScheduleMetadata: { suggestedTime: "string", timezone: "Asia/Dubai", reason: "string" },
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
          hashtags: [],
          assetNotes: [],
          altText: ""
        },
        suggestedScheduleMetadata: { suggestedTime: "TBD", timezone: "Asia/Dubai", reason: "Fallback mode." },
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
      "Summarize impressions, engagement, clicks, leads, search metrics, top/weak content, and next-best actions into a concise executive report. Be explicit when data is mock, partial, missing, or delayed. No data exfiltration, no publishing.",
    brainFiles: [
      "voice-calendar-memory.md",
      "workflow-contract.md",
      "approval-rules.md",
      "winning-hooks.md",
      "weak-hooks.md",
      "agent-analytics-memory.md",
      "agent-output-schemas.md"
    ],
    handoffFrom: "Publishing Agent",
    handoffTo: "Crina",
    outputSchema: {
      agent: "Analytics Agent",
      summary: "string",
      dataQuality: "real | partial | mock | missing",
      topContent: [{ title: "string", reason: "string", metricSignal: "string" }],
      weakContent: [{ title: "string", reason: "string", recommendedFix: "string" }],
      nextBestActions: ["string"],
      handoffTo: "Crina"
    },
    deterministicOutput: () => ({
      agent: "Analytics Agent",
      summary: "Deterministic fallback — Hermes unavailable. No live analytics retrieved.",
      dataQuality: "missing",
      topContent: [],
      weakContent: [],
      nextBestActions: ["Connect Hermes and integrations for real analytics."],
      handoffTo: "Crina"
    })
  }
};

/**
 * Agents that run automatically in the parallel team fan-out (the "researchers
 * / drafters"). Publishing (draft-only, manual) and Analytics (needs live
 * integration data) are intentionally excluded from auto-runs.
 */
export const teamFanOutKeys: SubAgentKey[] = ["competitor-intelligence", "seo", "content-creator", "visual-video"];
