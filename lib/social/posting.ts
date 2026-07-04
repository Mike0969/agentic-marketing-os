import { recordAgentRun } from "@/lib/agents/agent-runs";
import { notifyOperator } from "@/lib/marketing/notify";
import { publishMemberPost, refreshToken as refreshLinkedInToken } from "@/lib/social/linkedin";
import { publishPost as publishXPost, refreshToken as refreshXToken } from "@/lib/social/x";
import { publishPost as publishFacebookPost } from "@/lib/social/facebook";
import { publishPost as publishInstagramPost } from "@/lib/social/instagram";
import { publishPost as publishTikTokPost } from "@/lib/social/tiktok";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ContentItem } from "@/lib/types";

// Controlled live publishing. The ONLY path that posts to a real platform. Three guards must all
// hold: SOCIAL_POSTING_ENABLED=true, an operator-approved package, and a connected account for the
// brand. Called by the schedule runner when an operator-approved, operator-scheduled post is due —
// the human decided both the content and the time; this only executes it.

export function socialPostingEnabled() {
  return process.env.SOCIAL_POSTING_ENABLED === "true";
}

type SocialPlatform = "linkedin" | "x" | "facebook" | "instagram" | "tiktok";
type Connection = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  author_urn: string | null;
  status: string;
};

function normalizePlatform(platform: string): SocialPlatform | null {
  const value = platform.toLowerCase();
  if (value.includes("linkedin")) return "linkedin";
  if (value === "x" || value.includes("twitter")) return "x";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  return null;
}

function expiresSoon(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() < 10 * 60 * 1000;
}

async function refreshIfNeeded(
  supabase: NonNullable<ReturnType<typeof createServiceClient>>,
  args: { brandId: string; platform: SocialPlatform; conn: Connection }
): Promise<Connection> {
  if (!args.conn.refresh_token || !expiresSoon(args.conn.expires_at)) return args.conn;
  const token =
    args.platform === "x"
      ? await refreshXToken(args.conn.refresh_token)
      : args.platform === "linkedin"
        ? await refreshLinkedInToken(args.conn.refresh_token)
        : null;
  if (!token?.access_token) return args.conn;

  const updated: Partial<Connection> = {
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? args.conn.refresh_token,
    expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : args.conn.expires_at
  };
  await supabase
    .from("social_connections")
    .update({ ...updated, updated_at: new Date().toISOString() })
    .eq("brand_id", args.brandId)
    .eq("platform", args.platform);
  return { ...args.conn, ...updated };
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
    .select("access_token,refresh_token,expires_at,author_urn,status")
    .eq("brand_id", item.brand_id)
    .eq("platform", platform)
    .eq("status", "connected")
    .maybeSingle();
  let conn = connRow as Connection | null;
  if (!conn?.access_token || !conn.author_urn) return { ok: false as const, error: `This brand has no connected ${platform} account.` };
  try {
    conn = await refreshIfNeeded(supabase, { brandId: item.brand_id, platform, conn });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : `${platform} token refresh failed.` };
  }
  const accessToken = conn.access_token;
  const authorUrn = conn.author_urn;
  if (!accessToken || !authorUrn) return { ok: false as const, error: `This brand has no connected ${platform} account.` };

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
        ? await publishMemberPost(accessToken, authorUrn, message, imageUrl)
        : platform === "x"
          ? await publishXPost(accessToken, authorUrn, message, imageUrl)
          : platform === "facebook"
            ? await publishFacebookPost(accessToken, authorUrn, message, imageUrl)
            : platform === "instagram"
              ? await publishInstagramPost(accessToken, authorUrn, message, imageUrl)
              : await publishTikTokPost(accessToken, authorUrn, message, imageUrl);
    await supabase
      .from("content_items")
      .update({ status: "published", published_at: new Date().toISOString(), ready_package: { ...pkg, posted_url: res.url, posted_platform: platform, posting_error: null } })
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
    void notifyOperator(`✅ Posted to ${platform} (${item.title})${res.url ? `\n${res.url}` : ""}`);
    return { ok: true as const, url: res.url };
  } catch (e) {
    const error = e instanceof Error ? e.message : `${platform} post failed.`;
    // Self-heal: a 401/unauthorized means the stored token is dead — flag the connection so the UI
    // shows "reconnect needed" instead of a misleading "connected" that never posts.
    if (/\b401\b|unauthorized|invalid.*token|token.*invalid/i.test(error)) {
      await supabase
        .from("social_connections")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("brand_id", item.brand_id)
        .eq("platform", platform);
    }
    await supabase
      .from("content_items")
      .update({ ready_package: { ...pkg, posting_error: error } })
      .eq("id", contentItemId);
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
    void notifyOperator(`⚠️ ${platform} post FAILED (${item.title}): ${error}`);
    return { ok: false as const, error };
  }
}
