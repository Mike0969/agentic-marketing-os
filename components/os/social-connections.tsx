import { OSBadge, OSPanel } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { linkedinConfigured } from "@/lib/social/linkedin";
import { xConfigured } from "@/lib/social/x";
import { facebookConfigured } from "@/lib/social/facebook";
import { instagramConfigured } from "@/lib/social/instagram";
import { tiktokConfigured } from "@/lib/social/tiktok";
import { socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type ConnRow = { brand_id: string; platform: string; status: string; author_urn: string | null; updated_at: string };

const platforms = [
  { key: "linkedin", label: "LinkedIn", configured: linkedinConfigured, env: "LINKEDIN_CLIENT_ID / SECRET", note: "Member posting; images supported." },
  { key: "x", label: "X", configured: xConfigured, env: "X_CLIENT_ID", note: "OAuth2 PKCE; text tweets only in v1." },
  { key: "facebook", label: "Facebook Page", configured: facebookConfigured, env: "FACEBOOK_CLIENT_ID / SECRET", note: "Page feed/photo posting; App Review likely required." },
  { key: "instagram", label: "Instagram", configured: instagramConfigured, env: "INSTAGRAM_CLIENT_ID / SECRET", note: "Business/Creator image publishing; App Review required." },
  { key: "tiktok", label: "TikTok", configured: tiktokConfigured, env: "TIKTOK_CLIENT_ID / SECRET", note: "Content Posting API is video-only." }
] as const;

export async function SocialConnections() {
  const data = await getDashboardData();
  let connections: ConnRow[] = [];
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data: rows } = await supabase.from("social_connections").select("brand_id,platform,status,author_urn,updated_at");
      connections = (rows ?? []) as ConnRow[];
    }
  }
  const posting = socialPostingEnabled();

  return (
    <OSPanel className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Social connections</h2>
        <div className="flex gap-1.5">
          <OSBadge tone={posting ? "ok" : "off"}>{posting ? "Posting ENABLED" : "Posting off"}</OSBadge>
        </div>
      </div>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
        Connect each brand&apos;s social accounts for controlled publishing. Posting only fires through the approved publishing path, and only when <code className="text-neutral-400">SOCIAL_POSTING_ENABLED=true</code>. Tokens are stored server-side, never in the browser.
      </p>
      <div className="space-y-2">
        {data.brands.map((brand) => {
          return (
            <div key={brand.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-100">{brand.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">Brand-scoped connections</div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {platforms.map((platform) => {
                  const configured = platform.configured();
                  const conn = connections.find((c) => c.brand_id === brand.id && c.platform === platform.key);
                  return (
                    <div key={platform.key} className="flex flex-col justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/50 p-3">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-neutral-100">{platform.label}</span>
                          <OSBadge tone={conn ? "ok" : configured ? "off" : "warn"}>{conn ? conn.status : configured ? "not connected" : "not configured"}</OSBadge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">{platform.note}</p>
                      </div>
                      {configured ? (
                        <a
                          href={`/api/auth/${platform.key}/start?brand_id=${brand.id}`}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
                        >
                          {conn ? `Reconnect ${platform.label}` : `Connect ${platform.label}`}
                        </a>
                      ) : (
                        <OSBadge tone="off">Set {platform.env}</OSBadge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </OSPanel>
  );
}
