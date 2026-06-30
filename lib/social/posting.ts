import { recordAgentRun } from "@/lib/agents/agent-runs";
import { publishMemberPost } from "@/lib/social/linkedin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types";

// Controlled live publishing. The ONLY path that posts to a real platform. Three guards must all
// hold: SOCIAL_POSTING_ENABLED=true, an operator-approved package, and a connected account for the
// brand. Never called from a loop/cron — only from the operator's explicit Approve & Post action.

export function socialPostingEnabled() {
  return process.env.SOCIAL_POSTING_ENABLED === "true";
}

type Connection = { access_token: string | null; author_urn: string | null; status: string };

export async function publishApprovedPackage(contentItemId: string) {
  if (!socialPostingEnabled()) return { ok: false as const, error: "Live posting is off (set SOCIAL_POSTING_ENABLED=true)." };
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: itemRow } = await supabase.from("content_items").select("*").eq("id", contentItemId).maybeSingle();
  const item = itemRow as ContentItem | null;
  if (!item) return { ok: false as const, error: "Content item not found." };

  const platform = (item.platform || "").toLowerCase();
  if (!platform.includes("linkedin")) return { ok: false as const, error: `No connector yet for "${item.platform}" (LinkedIn only for now).` };

  const { data: connRow } = await supabase
    .from("social_connections")
    .select("access_token,author_urn,status")
    .eq("brand_id", item.brand_id)
    .eq("platform", "linkedin")
    .eq("status", "connected")
    .maybeSingle();
  const conn = connRow as Connection | null;
  if (!conn?.access_token || !conn.author_urn) return { ok: false as const, error: "This brand has no connected LinkedIn account." };

  const pkg = (item.ready_package ?? {}) as Record<string, unknown>;
  const title = typeof pkg.title === "string" ? pkg.title : "";
  const bodyText = typeof pkg.text === "string" ? pkg.text : item.body;
  const hashtags = Array.isArray(pkg.hashtags) ? pkg.hashtags.map(String) : [];
  const message = [title, bodyText, hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2900);
  if (!message.trim()) return { ok: false as const, error: "Nothing to post." };

  try {
    const res = await publishMemberPost(conn.access_token, conn.author_urn, message);
    await supabase
      .from("content_items")
      .update({ status: "published", published_at: new Date().toISOString(), ready_package: { ...pkg, posted_url: res.url, posted_platform: "linkedin" } })
      .eq("id", contentItemId);
    await recordAgentRun({
      agentName: "Publishing Agent",
      agentId: "agent-publishing",
      workflowName: "Publish to LinkedIn",
      provider: "linkedin",
      status: "success",
      input: { contentItemId, brand_id: item.brand_id, platform: "linkedin" },
      output: { url: res.url },
      error: null,
      model: null,
      durationMs: 0
    });
    return { ok: true as const, url: res.url };
  } catch (e) {
    const error = e instanceof Error ? e.message : "LinkedIn post failed.";
    await recordAgentRun({
      agentName: "Publishing Agent",
      agentId: "agent-publishing",
      workflowName: "Publish to LinkedIn",
      provider: "linkedin",
      status: "error",
      input: { contentItemId, brand_id: item.brand_id, platform: "linkedin" },
      output: {},
      error,
      model: null,
      durationMs: 0
    });
    return { ok: false as const, error };
  }
}
