import { OSBadge, OSPanel } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type ConnRow = { brand_id: string; platform: string; status: string };
type OAuthStatus = Record<string, string | undefined>;

const platforms = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" }
] as const;

function messageFor(status?: string, detail?: string) {
  if (!status) return null;
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
            ? "X rejected the redirect URI. It must exactly match X_REDIRECT_URI and the callback URL in the X developer portal."
            : detail === "account_lookup"
              ? "Token exchange worked, but X /2/users/me failed. Check that the app has users.read."
              : detail === "db_write"
                ? "X authorized, but saving the connection failed in Supabase."
                : "The OAuth callback failed. Check the dev server log for the sanitized error.";
    return { tone: "danger" as const, text: `${hint}${detail ? ` (${detail})` : ""}` };
  }
  return null;
}

export async function SocialConnections({ oauthStatus = {} }: { oauthStatus?: OAuthStatus }) {
  const data = await getDashboardData();
  let connections: ConnRow[] = [];
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data: rows } = await supabase.from("social_connections").select("brand_id,platform,status");
      connections = (rows ?? []) as ConnRow[];
    }
  }
  const posting = socialPostingEnabled();

  return (
    <OSPanel className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Social connections</h2>
        <OSBadge tone={posting ? "ok" : "off"}>{posting ? "Posting ENABLED" : "Posting off"}</OSBadge>
      </div>
      <p className="mb-4 mt-1 text-sm text-neutral-500">Connect each brand&apos;s accounts. API keys live in <code className="text-neutral-400">.env.local</code> — here you just connect.</p>
      {platforms.map((platform) => {
        const message = messageFor(oauthStatus[platform.key], oauthStatus[`${platform.key}_detail`]);
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
                return (
                  <div key={platform.key} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 bg-neutral-900/50 p-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-100">{platform.label}</div>
                      <div className={`text-xs ${conn ? "text-emerald-300" : "text-neutral-500"}`}>{conn ? "connected" : "not connected"}</div>
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
