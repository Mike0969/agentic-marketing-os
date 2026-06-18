import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reworkCrinaPlan } from "@/lib/agents/crina-plan-rework";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { contentItemId?: string; feedback?: string; feedbackTags?: string[] };
  if (!body.contentItemId) return NextResponse.json({ error: "contentItemId is required." }, { status: 400 });

  const result = await reworkCrinaPlan({
    contentItemId: body.contentItemId,
    feedback: body.feedback ?? "",
    feedbackTags: Array.isArray(body.feedbackTags) ? body.feedbackTags : []
  });

  if (!result.item) return NextResponse.json({ error: result.error ?? "Could not rework plan." }, { status: 404 });
  return NextResponse.json(result, { headers: { "x-agent-provider": result.provider, "x-agent-fallback": result.fallback ? "true" : "false" } });
}
