import { OSBadge, OSPanel } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { connectionView, type ConnectionView } from "@/lib/social/connection-status";
import { socialPostingEnabled } from "@/lib/social/posting";
import { peekVerification, verifyLabel, type VerifyResult } from "@/lib/social/verify";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type ConnRow = { brand_id: string; platform: string; status: string; expires_at: string | null; has_refresh_token: boolean };
type OAuthStatus = Record<string, string | undefined>;

const platforms = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" }
] as const;

const VIEW_CLASS: Record<ConnectionView, string> = {
  connected: "text-emerald-300",
  expiring: "text-amber-300",
  expired: "text-rose-300",
  revoked: "text-rose-300",
  "not connected": "text-neutral-500"
};

const NEEDS: Record<string, string> = {
  facebook: "the Meta App ID and App secret",
  instagram: "the Meta App ID and App secret (Instagram uses the same Meta app)",
  linkedin: "the LinkedIn Client ID and Client secret",
  x: "the X OAuth 2.0 Client ID (and secret)",
  tiktok: "the TikTok Client key and Client secret"
};

function messageFor(status?: string, detail?: string, platform?: string) {
  if (!status) return null;
  if (status === "not_configured") return { tone: "warn" as const, text: `needs ${NEEDS[platform ?? ""] ?? "its app keys"}: add them below in App keys, then press Connect again.` };
  if (status === "connected") return { tone: "ok" as const, text: "Connected successfully." };
  if (status === "denied") return { tone: "warn" as const, text: "Authorization was cancelled." };
  if (status === "state_error") return { tone: "danger" as const, text: `OAuth state failed${detail ? ` (${detail})` : ""}. Start from the Settings page again and complete the flow in the same browser.` };
  if (status === "error") {
    const hint =
      detail === "invalid_client"
        ? "X rejected the client credentials. Use the OAuth 2.0 Client ID and OAuth 2.0 Client Secret for the same app."
        : detail === "x_project"
          ? "X accepted OAuth, but the app is not attached to an X Developer Project. Attach/create the app inside a Project, then use that app's OAuth 2.0 Client ID and Secret."
        : detail === "invalid_grant"
          ? "X rejected the one-time code. Start the connection again; OAuth codes expire quickly and can only be used once."
          : detail === "redirect_uri"
            ? "The platform rejected the redirect URI. Copy it from App keys below into the platform's developer portal exactly."
            : detail === "account_lookup"
              ? "Token exchange worked, but X /2/users/me failed. Check that the app has users.read."
              : detail === "db_write"
                ? "The platform authorized, but saving the connection failed. Try again."
                : detail === "brand"
                  ? "That brand could not be found. Press Connect again from this page."
                  : detail === "db_read"
                    ? "The brand's settings could not be read. Try again in a minute."
                    : "The connection did not complete. Press Connect again; if it repeats, check the app keys and redirect URI below.";
    return { tone: "danger" as const, text: `${hint}${detail ? ` (${detail})` : ""}` };
  }
  return null;
}

export async function SocialConnections({ oauthStatus = {} }: { oauthStatus?: OAuthStatus }) {
  const data = await getDashboardData();
  let connections: ConnRow[] = [];
  const verified = new Map<string, VerifyResult>();
  const checking = new Set<string>();
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data: rows } = await supabase.from("social_connections").select("brand_id,platform,status,expires_at,refresh_token,author_urn");
      // Read-only live check of each connected token (cached 10 min): "really connected", not just "a row exists".
      const service = createServiceClient();
      if (service) {
        const live = ((rows ?? []) as Array<{ brand_id: string; platform: string; status: string; author_urn: string | null }>).filter((r) => r.status === "connected");
        // Never blocks the render: last known result now, fresh check in the background.
        for (const r of live) {
          const v = peekVerification(service, r.brand_id, r.platform, r.author_urn);
          if (v) verified.set(`${r.brand_id}:${r.platform}`, v);
          else checking.add(`${r.brand_id}:${r.platform}`);
        }
      }
      // Only whether a refresh token exists is kept; the token itself never leaves this function.
      connections = ((rows ?? []) as Array<Omit<ConnRow, "has_refresh_token"> & { refresh_token: string | null }>).map((r) => ({
        brand_id: r.brand_id,
        platform: r.platform,
        status: r.status,
        expires_at: r.expires_at,
        has_refresh_token: Boolean(r.refresh_token)
      }));
    }
  }
  const posting = socialPostingEnabled();

  return (
    <OSPanel className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Social connections</h2>
        <OSBadge tone={posting ? "ok" : "off"}>{posting ? "Posting ENABLED" : "Posting off"}</OSBadge>
      </div>
      <p className="mb-4 mt-1 text-sm text-neutral-500">Connect each brand&apos;s accounts with Connect / Reconnect. The status is checked live with each platform (hover it for details).</p>
      {platforms.map((platform) => {
        const message = messageFor(oauthStatus[platform.key], oauthStatus[`${platform.key}_detail`], platform.key);
        if (!message) return null;
        return (
          <div key={`${platform.key}:message`} className="mb-3 rounded-md border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-sm text-neutral-300">
            <OSBadge tone={message.tone}>{platform.label}</OSBadge>
            <span className="ml-2">{message.text}</span>
          </div>
        );
      })}
      <div className="space-y-3">
        {data.brands.map((brand) => (
          <div key={brand.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="text-sm font-medium text-neutral-100">{brand.name}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {platforms.map((platform) => {
                const conn = connections.find((c) => c.brand_id === brand.id && c.platform === platform.key);
                const view = connectionView(conn);
                return (
                  <div key={platform.key} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 p-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-100">{platform.label}</div>
                      {(() => {
                        const label = verifyLabel(verified.get(`${brand.id}:${platform.key}`));
                        if (!label && checking.has(`${brand.id}:${platform.key}`)) {
                          return <div className="text-xs text-neutral-500">checking… (reload in a few seconds)</div>;
                        }
                        if (!label) {
                          return (
                            <div className={`text-xs ${VIEW_CLASS[view]}`} title={conn?.expires_at ? `Token expires ${conn.expires_at}` : undefined}>
                              {view}
                            </div>
                          );
                        }
                        const cls = label.tone === "ok" ? "text-emerald-300" : label.tone === "danger" ? "text-red-300" : "text-amber-300";
                        return (
                          <div className={`text-xs ${cls}`} title={verified.get(`${brand.id}:${platform.key}`)?.detail}>
                            {label.text}
                          </div>
                        );
                      })()}
                    </div>
                    <a
                      href={`/api/auth/${platform.key}/start?brand_id=${brand.id}`}
                      className="shrink-0 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/15"
                    >
                      {conn ? "Reconnect" : "Connect"}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </OSPanel>
  );
}
