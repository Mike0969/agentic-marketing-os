import { recordAgentRun } from "@/lib/agents/agent-runs";
import { publishMemberPost } from "@/lib/social/linkedin";
import { publishPost as publishXPost } from "@/lib/social/x";
import { publishPost as publishFacebookPost } from "@/lib/social/facebook";
import { publishPost as publishInstagramPost } from "@/lib/social/instagram";
import { publishPost as publishTikTokPost } from "@/lib/social/tiktok";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types";

// Controlled live publishing. The ONLY path that posts to a real platform. Three guards must all
// hold: SOCIAL_POSTING_ENABLED=true, an operator-approved package, and a connected account for the
// brand. Never called from a loop/cron — only from the operator's explicit Approve & Post action.

export function socialPostingEnabled() {
  return process.env.SOCIAL_POSTING_ENABLED === "true";
}

type SocialPlatform = "linkedin" | "x" | "facebook" | "instagram" | "tiktok";
type Connection = { access_token: string | null; author_urn: string | null; status: string };

function normalizePlatform(platform: string): SocialPlatform | null {
  const value = platform.toLowerCase();
  if (value.includes("linkedin")) return "linkedin";
  if (value === "x" || value.includes("twitter")) return "x";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  return null;
}

export async function publishApprovedPackage(contentItemId: string) {
  if (!socialPostingEnabled()) return { ok: false as const, error: "Live posting is off (set SOCIAL_POSTING_ENABLED=true)." };
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase not configured." };
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return { ok: false as const, error: "Supabase not available." };

  const { data: itemRow } = await supabase.from("content_items").select("*").eq("id", contentItemId).maybeSingle();
  const item = itemRow as ContentItem | null;
  if (!item) return { ok: false as const, error: "Content item not found." };

  const platform = normalizePlatform(item.platform || "");
  if (!platform) return { ok: false as const, error: `No connector yet for "${item.platform}".` };

  const { data: connRow } = await supabase
    .from("social_connections")
    .select("access_token,author_urn,status")
    .eq("brand_id", item.brand_id)
    .eq("platform", platform)
    .eq("status", "connected")
    .maybeSingle();
  const conn = connRow as Connection | null;
  if (!conn?.access_token || !conn.author_urn) return { ok: false as const, error: `This brand has no connected ${platform} account.` };

  const pkg = (item.ready_package ?? {}) as Record<string, unknown>;
  const title = typeof pkg.title === "string" ? pkg.title : "";
  const bodyText = typeof pkg.text === "string" ? pkg.text : item.body;
  const hashtags = Array.isArray(pkg.hashtags) ? pkg.hashtags.map(String) : [];
  const message = [title, bodyText, hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2900);
  if (!message.trim()) return { ok: false as const, error: "Nothing to post." };

  const imageUrl = item.visual_asset_url || (typeof pkg.image === "string" ? pkg.image : null);

  try {
    const res =
      platform === "linkedin"
        ? await publishMemberPost(conn.access_token, conn.author_urn, message, imageUrl)
        : platform === "x"
          ? await publishXPost(conn.access_token, conn.author_urn, message, imageUrl)
          : platform === "facebook"
            ? await publishFacebookPost(conn.access_token, conn.author_urn, message, imageUrl)
            : platform === "instagram"
              ? await publishInstagramPost(conn.access_token, conn.author_urn, message, imageUrl)
              : await publishTikTokPost(conn.access_token, conn.author_urn, message, imageUrl);
    await supabase
      .from("content_items")
      .update({ status: "published", published_at: new Date().toISOString(), ready_package: { ...pkg, posted_url: res.url, posted_platform: platform } })
      .eq("id", contentItemId);
    await recordAgentRun({
      agentName: "Publishing Agent",
      agentId: "agent-publishing",
      workflowName: `Publish to ${platform}`,
      provider: platform,
      status: "success",
      input: { contentItemId, brand_id: item.brand_id, platform },
      output: { url: res.url },
      error: null,
      model: null,
      durationMs: 0
    });
    return { ok: true as const, url: res.url };
  } catch (e) {
    const error = e instanceof Error ? e.message : `${platform} post failed.`;
    await recordAgentRun({
      agentName: "Publishing Agent",
      agentId: "agent-publishing",
      workflowName: `Publish to ${platform}`,
      provider: platform,
      status: "error",
      input: { contentItemId, brand_id: item.brand_id, platform },
      output: {},
      error,
      model: null,
      durationMs: 0
    });
    return { ok: false as const, error };
  }
}
