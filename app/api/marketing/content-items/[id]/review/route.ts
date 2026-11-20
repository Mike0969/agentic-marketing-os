import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { preflight, withCampaignBudget, STEP_AGENTS } from "@/lib/budget/model-budget";
import { defaultVault, recordLearning } from "@/lib/learning/vault";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand, Campaign, ContentItem } from "@/lib/types";
import { POST as finalApproval } from "@/app/api/marketing/approvals/[contentItemId]/route";
import { POST as rework } from "@/app/api/marketing/content-items/[id]/rework/route";

export const runtime = "nodejs";
export const maxDuration = 300;

type PartDecision = { decision: "yes" | "rework"; reason: string };

function readPart(value: unknown): PartDecision | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return "invalid";
  const raw = value as Record<string, unknown>;
  if (raw.decision !== "yes" && raw.decision !== "rework") return "invalid";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  if (raw.decision === "rework" && !reason) return "invalid";
  return { decision: raw.decision, reason };
}

function textOf(item: ContentItem) {
  const pkg = item.ready_package;
  return [pkg?.title ?? item.title, item.hook, pkg?.text ?? item.body, item.CTA ? `CTA: ${item.CTA}` : "", pkg?.hashtags?.length ? pkg.hashtags.join(" ") : ""].filter(Boolean).join("\n");
}

function visualOf(item: ContentItem) {
  const asset = item.ready_package?.assets?.[0];
  return [asset?.prompt ? `Prompt: ${asset.prompt}` : "", item.visual_asset_url ? `Image: ${item.visual_asset_url}` : "", asset?.status ? `Status: ${asset.status}` : ""].filter(Boolean).join("\n") || "No visual.";
}

/**
 * Review screen, one post: Yes / Rework (+ reason) for the text and for the visual.
 * Every decision is saved to the learning notes. All Yes -> the existing final
 * approval (-> Schedule; posting itself stays behind SOCIAL_POSTING_ENABLED).
 * Any Rework -> the existing rework route, only for the parts he sent back.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = readPart(body?.text);
  const visual = readPart(body?.visual);
  if (!text || text === "invalid" || visual === "invalid") {
    return NextResponse.json({ error: "Choose Yes or Rework for each part, and give a reason for every Rework." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });
  const { data: itemRow } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
  const item = itemRow as ContentItem | null;
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (item.approval_status !== "pending") return NextResponse.json({ error: "This post is not waiting for review." }, { status: 409 });
  const { data: brandRow } = await supabase.from("brands").select("*").eq("id", item.brand_id).maybeSingle();
  const brand = brandRow as Brand | null;
  const { data: campaignRow } = item.campaign_id ? await supabase.from("campaigns").select("*").eq("id", item.campaign_id).maybeSingle() : { data: null };
  const campaign = campaignRow as Campaign | null;

  if ((text.decision === "rework" || visual?.decision === "rework")) {
    const refused = await preflight(item.campaign_id ?? null, STEP_AGENTS.rework);
    if (refused) return NextResponse.json({ error: refused }, { status: 429 });
  }

  const vault = defaultVault(brand?.name);
  const campaignTitle = campaign?.title ?? item.title;
  const notes: string[] = [];
  const parts: Array<["text" | "visual", PartDecision | null, string, string]> = [
    ["text", text, textOf(item), "Content Creator Agent"],
    ["visual", visual, visualOf(item), "Visual & Video Agent"]
  ];
  for (const [part, decision, itemText, agent] of parts) {
    if (!decision) continue;
    const file = await recordLearning(vault, {
      kind: decision.decision === "yes" ? "approved" : "rejected",
      part,
      campaign: campaignTitle,
      platform: item.platform,
      agent,
      reason: decision.reason,
      item: itemText
    });
    if (file) notes.push(file);
  }

  const reworkParts = parts.filter(([, decision]) => decision?.decision === "rework").map(([part]) => part);
  if (!reworkParts.length) {
    const res = await finalApproval(
      new Request(new URL(`/api/marketing/approvals/${id}`, request.url), { method: "POST", body: JSON.stringify({ decision: "approved", gate: "gate_2", feedback: "Yes on every part (Review screen)." }) }),
      { params: Promise.resolve({ contentItemId: id }) }
    );
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json({ outcome: res.ok ? "approved" : "error", notes, ...(res.ok ? {} : { error: (payload as { error?: string }).error ?? "Approval failed." }) }, { status: res.ok ? 200 : res.status });
  }

  const remark = parts
    .filter(([, decision]) => decision?.decision === "rework")
    .map(([part, decision]) => `${part === "text" ? "Text" : "Visual"}: ${decision!.reason}`)
    .join("\n");
  const res = await withCampaignBudget(item.campaign_id ?? null, () =>
    rework(
      new Request(new URL(`/api/marketing/content-items/${id}/rework`, request.url), { method: "POST", headers: request.headers, body: JSON.stringify({ remark, parts: reworkParts }) }),
      { params: Promise.resolve({ id }) }
    )
  );
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json({ outcome: res.ok ? "rework" : "error", parts: reworkParts, notes, ...(res.ok ? {} : { error: (payload as { error?: string }).error ?? "Rework failed." }) }, { status: res.ok ? 200 : res.status });
}
