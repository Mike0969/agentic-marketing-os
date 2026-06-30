import { OSBadge, OSPanel } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { linkedinConfigured } from "@/lib/social/linkedin";
import { socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type ConnRow = { brand_id: string; platform: string; status: string; author_urn: string | null; updated_at: string };

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
  const linkedinByBrand = new Map(connections.filter((c) => c.platform === "linkedin").map((c) => [c.brand_id, c]));
  const configured = linkedinConfigured();
  const posting = socialPostingEnabled();

  return (
    <OSPanel className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-50">Social connections</h2>
        <div className="flex gap-1.5">
          <OSBadge tone={posting ? "ok" : "off"}>{posting ? "Posting ENABLED" : "Posting off"}</OSBadge>
          {!configured ? <OSBadge tone="warn">LinkedIn app not configured</OSBadge> : null}
        </div>
      </div>
      <p className="mb-4 mt-1 text-sm text-neutral-500">
        Connect a brand&apos;s LinkedIn so you can <strong>Approve &amp; Post</strong> an approved package from Ready to Post. Posting only fires on your explicit approval, and only when <code className="text-neutral-400">SOCIAL_POSTING_ENABLED=true</code>. Tokens are stored server-side, never in the browser.
      </p>
      <div className="space-y-2">
        {data.brands.map((brand) => {
          const conn = linkedinByBrand.get(brand.id);
          return (
            <div key={brand.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-100">{brand.name}</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  LinkedIn {conn ? <span className="text-emerald-300">· connected ({conn.status})</span> : "· not connected"}
                </div>
              </div>
              {configured ? (
                <a
                  href={`/api/auth/linkedin/start?brand_id=${brand.id}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
                >
                  {conn ? "Reconnect LinkedIn" : "Connect LinkedIn"}
                </a>
              ) : (
                <OSBadge tone="off">Set LINKEDIN_CLIENT_ID / SECRET</OSBadge>
              )}
            </div>
          );
        })}
      </div>
    </OSPanel>
  );
}
