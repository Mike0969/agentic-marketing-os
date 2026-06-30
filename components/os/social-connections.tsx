import { OSBadge, OSPanel } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type ConnRow = { brand_id: string; platform: string; status: string };

const platforms = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "x", label: "X" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" }
] as const;

export async function SocialConnections() {
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
