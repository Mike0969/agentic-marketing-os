import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runHermesAgent } from "@/lib/agents/hermes-client";
import { readLocalDashboardData } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

type BrandAnalysis = {
  positioningDiagnosis: string;
  audienceGaps: string[];
  contentPillarRecommendations: string[];
  seoOpportunities: string[];
  ctaRecommendations: string[];
  approvalRisks: string[];
  nextActions: string[];
};

const outputSchema = {
  positioningDiagnosis: "One concise paragraph diagnosing strategic clarity and credibility.",
  audienceGaps: ["Specific missing audience context that would improve marketing output."],
  contentPillarRecommendations: ["Concrete pillar improvements for this brand."],
  seoOpportunities: ["Search topics or keyword clusters to prioritize."],
  ctaRecommendations: ["Reusable CTAs that fit the brand and buying journey."],
  approvalRisks: ["Claims or content areas requiring human review."],
  nextActions: ["Immediate actions to improve the brand profile."]
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
}

function normalizeAnalysis(value: unknown): BrandAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const positioningDiagnosis = typeof raw.positioningDiagnosis === "string" ? raw.positioningDiagnosis : "";
  if (!positioningDiagnosis) return null;

  return {
    positioningDiagnosis,
    audienceGaps: asStringArray(raw.audienceGaps),
    contentPillarRecommendations: asStringArray(raw.contentPillarRecommendations),
    seoOpportunities: asStringArray(raw.seoOpportunities),
    ctaRecommendations: asStringArray(raw.ctaRecommendations),
    approvalRisks: asStringArray(raw.approvalRisks),
    nextActions: asStringArray(raw.nextActions)
  };
}

function deterministicBrandAnalysis(brand: Brand, reason: string): BrandAnalysis {
  const isGrid = brand.name.toLowerCase().includes("grid");

  return {
    positioningDiagnosis: `${brand.name} has a usable strategic base, but this is deterministic fallback analysis because Hermes could not return valid JSON: ${reason}`,
    audienceGaps: isGrid
      ? ["Clarify which investor or infrastructure buyer is primary for each campaign.", "Add any verified project stage, capacity, or partner constraints before claims are made."]
      : ["Separate rider, driver, fleet, regulator, and investor messaging so NexRide does not sound generic.", "Add verified launch geography and availability constraints before market-facing claims."],
    contentPillarRecommendations: isGrid
      ? ["Turn grid constraints into investor underwriting explainers.", "Create a power-readiness pillar for data-center operators.", "Build proof-led posts around interconnection, reliability, and bankability."]
      : ["Build recurring posts around zero-commission driver economics.", "Show AI dispatch as operational trust, not hype.", "Create GCC-specific mobility and loyalty narratives."],
    seoOpportunities: (brand.seo_targets ?? "")
      .split(/[;\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4),
    ctaRecommendations: (brand.reusable_ctas ?? "")
      .split(/[;\n]/)
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4),
    approvalRisks: (brand.approval_rules ?? "Require approval for technical, investment, launch, partner, regulatory, or availability claims.")
      .split(/[;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4),
    nextActions: ["Fill any empty brand context fields.", "Add verified proof points before asking agents for final copy.", "Run Crina again after updating SEO targets and CTAs."]
  };
}

async function readBrand(id: string): Promise<Brand | null> {
  if (!isSupabaseConfigured()) {
    const data = await readLocalDashboardData();
    return data.brands.find((brand) => brand.id === id) ?? null;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from("brands").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return (data as Brand | null) ?? null;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const brand = await readBrand(id);

  if (!brand) {
    return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  }

  const result = await runHermesAgent({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Brand Profile Analysis",
    instructions:
      "Analyze this brand profile for marketing usefulness. Focus on strategy clarity, missing context, SEO targets, approved CTAs, and approval risk. Do not create campaign copy.",
    outputSchema,
    input: { brand },
    brainFiles: ["brand-briefs.md", "brand-voice.md", "seo-targets.md", "approval-rules.md", "reusable-ctas.md"],
    temperature: 0.2
  });

  const hermesOutput = normalizeAnalysis(result.json);
  const fallback = !result.ok || !hermesOutput;
  const output = fallback ? deterministicBrandAnalysis(brand, result.error ?? "Hermes returned invalid analysis.") : hermesOutput;
  const provider = fallback ? "deterministic" : "hermes";
  const error = fallback ? result.error ?? "Hermes returned invalid analysis JSON." : null;

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Brand Profile Analysis",
    provider,
    status: fallback ? "fallback" : "success",
    input: { brandId: brand.id, brandName: brand.name },
    output: output as unknown as Record<string, unknown>,
    error,
    model: result.modelUsed,
    backupModel: result.backupModel,
    tokensPrompt: result.usage.tokensPrompt,
    tokensCompletion: result.usage.tokensCompletion,
    tokensTotal: result.usage.tokensTotal,
    durationMs: result.durationMs,
    brainResourcesUsed: result.brainResourcesUsed,
    providerResponseStatus: result.status
  });

  return NextResponse.json({ provider, fallback, output, error });
}
