import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { requireAgentAccess } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { conversionMemoryText, getConversionMemoryContext } from "@/lib/marketing/conversion-memory";
import { createServiceClient } from "@/lib/supabase/service";
import type { Brand } from "@/lib/types";

type CampaignIdea = {
  title: string;
  angle: string;
  hook: string;
  summary: string;
  rationale: string;
  platforms: string[];
  objective: string;
  target_audience: string;
  primary_cta: string;
};

const ideaSchema = {
  ideas: [
    {
      title: "Short, operator-readable campaign name.",
      angle: "The core idea / theme in one line.",
      hook: "A scroll-stopping opening line.",
      summary: "2-3 sentences on what this campaign says and to whom.",
      rationale: "Why this works for this brand and audience right now.",
      platforms: ["LinkedIn", "X", "Instagram", "Blog"],
      objective: "What this campaign should achieve.",
      target_audience: "Who it speaks to.",
      primary_cta: "One clear call to action."
    }
  ]
};

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeIdeas(value: unknown): CampaignIdea[] {
  const raw = (value as { ideas?: unknown })?.ideas;
  if (!Array.isArray(raw)) return [];
  const ideas: CampaignIdea[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const data = entry as Record<string, unknown>;
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title) continue;
    ideas.push({
      title,
      angle: String(data.angle ?? "").trim(),
      hook: String(data.hook ?? "").trim(),
      summary: String(data.summary ?? "").trim(),
      rationale: String(data.rationale ?? "").trim(),
      platforms: asArray(data.platforms).slice(0, 6),
      objective: String(data.objective ?? data.summary ?? title).trim(),
      target_audience: String(data.target_audience ?? "").trim(),
      primary_cta: String(data.primary_cta ?? data.cta ?? "Learn more").trim()
    });
  }
  return ideas.slice(0, 8);
}

function deterministicIdeas(brand: Brand | null, count: number): CampaignIdea[] {
  const name = brand?.name ?? "the brand";
  const pillars = (brand?.content_pillars || brand?.pillars || "growth; trust; proof").split(/[;,\n]/).map((p) => p.trim()).filter(Boolean);
  return Array.from({ length: count }, (_, index) => {
    const pillar = pillars[index % Math.max(pillars.length, 1)] || `theme ${index + 1}`;
    return {
      title: `${name}: ${pillar} campaign`,
      angle: `Build authority around ${pillar}.`,
      hook: `Here is what most people miss about ${pillar}.`,
      summary: `FALLBACK idea: a campaign for ${name} centered on ${pillar}.`,
      rationale: `Aligns with ${name}'s positioning; conservative claims, ready for human review.`,
      platforms: ["LinkedIn", "X", "Blog"],
      objective: `Grow awareness and trust around ${pillar} for ${name}.`,
      target_audience: brand?.target_audience ?? "Core audience",
      primary_cta: brand?.ctas?.split(/[;\n,]/)[0]?.trim() || "Learn more"
    };
  });
}

export async function POST(request: Request) {
  const access = await requireAgentAccess(request);
  if (!access.ok) return access.response;

  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as { brand_id?: string; count?: number; theme?: string };
  const brandId = body.brand_id?.trim();
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 8);

  if (!brandId) return NextResponse.json({ error: "A brand_id is required to propose ideas." }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: brand } = await supabase.from("brands").select("*").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });

  const conversion = await getConversionMemoryContext({ brandId });

  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Propose Campaign Ideas",
    instructions:
      `Propose ${count} distinct campaign ideas for this single brand only. Each idea must be specific, on-brand, and conservative with claims. Do not start or execute anything; these are proposals for a human to choose from. Keep all ideas scoped to this one brand — no cross-brand mixing.\n\nWhat has converted best for this brand (bias new ideas toward these):\n${conversionMemoryText(conversion)}`,
    outputSchema: ideaSchema,
    input: { brand, count, theme: body.theme ?? null, conversion_insights: conversion.insights },
    brainFiles: ["content-formulas.md", "approval-rules.md"],
    temperature: 0.6,
    routeOrigin: "api.marketing.campaigns.propose-ideas"
  });

  const modelIdeas = normalizeIdeas(run.json);
  const fallback = !run.ok || !modelIdeas.length;
  const ideas = (fallback ? deterministicIdeas(brand as Brand, count) : modelIdeas).slice(0, count);

  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 28).toISOString().slice(0, 10);
  const rows = ideas.map((idea) => ({
    brand_id: brandId,
    title: idea.title,
    objective: idea.objective,
    target_audience: idea.target_audience || (brand as Brand).target_audience || "Core audience",
    start_date: today,
    end_date: end,
    status: "idea",
    idea_brief: { ...idea, fallback_used: fallback, proposed_by: "agent-crina" }
  }));

  const { data: inserted, error } = await supabase.from("campaigns").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAgentRun({
    agentName: "Crina",
    agentId: "agent-crina",
    workflowName: "Propose Campaign Ideas",
    provider: run.provider,
    status: fallback ? "fallback" : "success",
    input: { brand: (brand as Brand).name, count, routeOrigin: "api.marketing.campaigns.propose-ideas" },
    output: { ideas_created: inserted?.length ?? 0, fallback_used: fallback, model: run.modelUsed },
    error: fallback ? run.error ?? "Crina returned invalid idea JSON." : null,
    model: run.modelUsed,
    tokensPrompt: run.usage.tokensPrompt,
    tokensCompletion: run.usage.tokensCompletion,
    tokensTotal: run.usage.tokensTotal,
    durationMs: Date.now() - startedAt,
    brainResourcesUsed: run.brainResourcesUsed,
    providerResponseStatus: run.status
  });

  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing");

  return NextResponse.json({ ideas: inserted ?? [], fallback, provider: run.provider, model: run.modelUsed });
}
