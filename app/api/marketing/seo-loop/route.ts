import { NextResponse } from "next/server";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { requireAgentAccessOrLocalhost } from "@/lib/auth";
import { callGLM } from "@/lib/providers/glm";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_ITERATIONS = 3;
const DEFAULT_MODEL = "glm-5.2";

type SeoBrief = {
  title: string;
  keywords: string[];
  summary: string;
  draft: string;
  meta_title?: string;
  meta_description?: string;
  cta?: string;
};

type CrinaReview = {
  decision: "approve" | "remake";
  reason: string;
  improvements?: string[];
};

type FeedbackExample = {
  content_summary: string | null;
  reason: string | null;
};

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeSeoBrief(value: Record<string, unknown> | null, topic: string, fallbackDraft?: string): SeoBrief {
  return {
    title: String(value?.title || `SEO brief: ${topic}`),
    keywords: asStringArray(value?.keywords).slice(0, 10),
    summary: String(value?.summary || `SEO content direction for ${topic}.`),
    draft: String(value?.draft || fallbackDraft || `Create a focused SEO article for ${topic} with a clear structure, proof points, and conversion CTA.`),
    meta_title: value?.meta_title ? String(value.meta_title) : undefined,
    meta_description: value?.meta_description ? String(value.meta_description) : undefined,
    cta: value?.cta ? String(value.cta) : undefined
  };
}

function normalizeReview(value: Record<string, unknown> | null): CrinaReview {
  const decision = value?.decision === "remake" ? "remake" : "approve";
  return {
    decision,
    reason: String(value?.reason || (decision === "approve" ? "Crina accepted the SEO brief for human review." : "Crina requested a stronger revision.")),
    improvements: asStringArray(value?.improvements)
  };
}

function summarizeBrief(brief: SeoBrief) {
  return [brief.title, brief.summary].filter(Boolean).join(" — ").slice(0, 500);
}

function makeBuilderPrompt(args: {
  topic: string;
  brandContext: string;
  iteration: number;
  previousBrief?: SeoBrief;
  improvements?: string[];
}) {
  return `
You are the SEO Agent inside the Agentic Marketing OS.
Create or revise an SEO blog brief. Do not publish. Do not invent unverified claims.

Brand context:
${args.brandContext}

Target topic:
${args.topic}

Iteration:
${args.iteration}

${args.previousBrief ? `Previous draft:\n${JSON.stringify(args.previousBrief, null, 2)}` : ""}
${args.improvements?.length ? `Crina requested these improvements:\n${args.improvements.map((item) => `- ${item}`).join("\n")}` : ""}

Return strict JSON only:
{
  "title": "string",
  "keywords": ["string"],
  "summary": "string",
  "draft": "SEO blog draft or detailed brief with headings, intro, body points, and CTA",
  "meta_title": "string",
  "meta_description": "string",
  "cta": "string"
}
`;
}

function makeCrinaPrompt(args: {
  brief: SeoBrief;
  topic: string;
  approvedExamples: FeedbackExample[];
  rejectedExamples: FeedbackExample[];
}) {
  return `
You are Crina, the Marketing CEO Agent. Review this SEO brief before it reaches the human.
Use the human memory below to decide whether the SEO Agent should remake it.

Target topic:
${args.topic}

Past approved examples:
${args.approvedExamples.length ? args.approvedExamples.map((item) => `- ${item.content_summary || "No summary"}${item.reason ? ` | reason: ${item.reason}` : ""}`).join("\n") : "- None yet"}

Past rejected examples:
${args.rejectedExamples.length ? args.rejectedExamples.map((item) => `- ${item.content_summary || "No summary"}${item.reason ? ` | reason: ${item.reason}` : ""}`).join("\n") : "- None yet"}

SEO brief to review:
${JSON.stringify(args.brief, null, 2)}

Decide approve or remake. Return strict JSON only:
{
  "decision": "approve" | "remake",
  "reason": "string",
  "improvements": ["specific instruction for SEO Agent"]
}
`;
}

export async function POST(request: Request) {
  const access = await requireAgentAccessOrLocalhost(request);
  if (!access.ok) return access.response;

  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as {
    brand_id?: string;
    topic?: string;
    model?: string;
  };

  const topic = body.topic?.trim() || "AI marketing growth for GridFactory.io and Gulf-EL.com / NexRide";
  const model = body.model?.trim() || DEFAULT_MODEL;
  const supabase = createServiceClient() ?? (await createClient());

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { data: brand } = body.brand_id
    ? await supabase
        .from("brands")
        .select("name, positioning, target_audience, tone_of_voice, pillars, seo_targets, ctas, approval_rules")
        .eq("id", body.brand_id)
        .maybeSingle()
    : { data: null };

  const brandContext = brand
    ? JSON.stringify(brand, null, 2)
    : "Use both default brands where relevant: GridFactory.io for investor-grade power/data-center infrastructure, and Gulf-EL.com / NexRide for GCC electric mobility.";

  const [approvedMemory, rejectedMemory] = await Promise.all([
    supabase
      .from("feedback_memory")
      .select("content_summary, reason")
      .eq("decided_by", "human")
      .eq("decision", "approved")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("feedback_memory")
      .select("content_summary, reason")
      .eq("decided_by", "human")
      .eq("decision", "rejected")
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  if (approvedMemory.error || rejectedMemory.error) {
    return NextResponse.json(
      { error: approvedMemory.error?.message || rejectedMemory.error?.message || "Could not read feedback memory." },
      { status: 500 }
    );
  }

  let queueId: string | null = null;
  let currentBrief: SeoBrief | undefined;
  let review: CrinaReview = { decision: "approve", reason: "Crina accepted the brief for human approval." };
  let fallbackUsed = false;
  let provider = "glm";
  let statusCode: number | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    const builderPrompt = makeBuilderPrompt({
      topic,
      brandContext,
      iteration,
      previousBrief: currentBrief,
      improvements: review.improvements
    });

    try {
      const builderResult = await callGLM(model, builderPrompt, "Return valid JSON only. You are an SEO builder, not a publisher.", 0.25);
      provider = builderResult.source;
      statusCode = builderResult.status;
      promptTokens += builderResult.usage?.promptTokens ?? 0;
      completionTokens += builderResult.usage?.completionTokens ?? 0;
      totalTokens += builderResult.usage?.totalTokens ?? 0;
      currentBrief = normalizeSeoBrief(parseJsonObject(builderResult.text), topic, builderResult.text);
    } catch (error) {
      fallbackUsed = true;
      currentBrief = normalizeSeoBrief(null, topic);
    }

    const content = {
      seo_brief: currentBrief,
      topic,
      brand_id: body.brand_id ?? null,
      builder_model: model,
      builder_provider: provider,
      fallback_used: fallbackUsed
    };

    if (!queueId) {
      const { data: queueRow, error: queueError } = await supabase
        .from("content_queue")
        .insert({
          type: "seo_brief",
          status: "pending_crina",
          content,
          agent_id: "seo-loop",
          loop_iteration: iteration
        })
        .select("id")
        .single();

      if (queueError) return NextResponse.json({ error: queueError.message }, { status: 500 });
      queueId = queueRow.id as string;
    } else {
      await supabase
        .from("content_queue")
        .update({
          content,
          status: "pending_crina",
          loop_iteration: iteration,
          updated_at: new Date().toISOString()
        })
        .eq("id", queueId);
    }

    try {
      const crinaResult = await callGLM(
        model,
        makeCrinaPrompt({
          brief: currentBrief,
          topic,
          approvedExamples: approvedMemory.data ?? [],
          rejectedExamples: rejectedMemory.data ?? []
        }),
        "Return valid JSON only. You are Crina, the Marketing CEO Agent reviewing SEO quality.",
        0.1
      );
      provider = crinaResult.source;
      statusCode = crinaResult.status;
      promptTokens += crinaResult.usage?.promptTokens ?? 0;
      completionTokens += crinaResult.usage?.completionTokens ?? 0;
      totalTokens += crinaResult.usage?.totalTokens ?? 0;
      review = normalizeReview(parseJsonObject(crinaResult.text));
    } catch (error) {
      fallbackUsed = true;
      review = {
        decision: "approve",
        reason: "FALLBACK: Crina review model was unavailable, so the brief was sent to human approval instead of being auto-published.",
        improvements: []
      };
    }

    const memoryDecision = review.decision === "remake" ? "remade" : "approved";
    await supabase.from("feedback_memory").insert({
      agent_id: "agent-crina",
      content_type: "seo_brief",
      content_summary: summarizeBrief(currentBrief),
      content_full: { seo_brief: currentBrief, crina_review: review, fallback_used: fallbackUsed },
      decision: memoryDecision,
      reason: review.reason,
      decided_by: "crina",
      loop_iteration: iteration
    });

    if (review.decision === "remake" && iteration < MAX_ITERATIONS) {
      await supabase
        .from("content_queue")
        .update({
          crina_verdict: "remake",
          crina_reason: review.reason,
          loop_iteration: iteration,
          updated_at: new Date().toISOString()
        })
        .eq("id", queueId);
      continue;
    }

    await supabase
      .from("content_queue")
      .update({
        status: "pending_human",
        content: { ...content, crina_review: review },
        crina_verdict: review.decision,
        crina_reason: review.reason,
        loop_iteration: iteration,
        updated_at: new Date().toISOString()
      })
      .eq("id", queueId);

    await recordAgentRun({
      agentName: "SEO Loop",
      agentId: "seo-loop",
      workflowName: "SEO Loop",
      provider: fallbackUsed ? `${provider}-fallback` : provider,
      status: fallbackUsed ? "fallback" : "success",
      input: { topic, brand_id: body.brand_id ?? null, model },
      output: {
        status_label: "done",
        queue_id: queueId,
        loop_iterations: iteration,
        crina_verdict: review.decision,
        content
      },
      error: fallbackUsed ? "FALLBACK used during SEO loop." : null,
      model,
      tokensPrompt: promptTokens || null,
      tokensCompletion: completionTokens || null,
      tokensTotal: totalTokens || null,
      durationMs: Date.now() - startedAt,
      providerResponseStatus: statusCode
    });

    return NextResponse.json({
      queue_id: queueId,
      loop_iterations: iteration,
      crina_verdict: review.decision,
      content: { ...content, crina_review: review }
    });
  }

  return NextResponse.json({ error: "SEO loop did not complete." }, { status: 500 });
}
