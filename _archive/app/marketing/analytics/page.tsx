import { BarChart3, MousePointerClick, Search, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { listIntegrationConfigs } from "@/lib/integration-store";
import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

const bars = [
  { label: "GridFactory LinkedIn", value: 82 },
  { label: "NexRide Launch", value: 68 },
  { label: "GridFactory SEO", value: 54 },
  { label: "NexRide Instagram", value: 43 }
];

export default async function AnalyticsPage() {
  const [integrations, { brands }] = await Promise.all([listIntegrationConfigs(), getDashboardData()]);
  const analyticsConnectors = integrations.filter((item) => ["ga4", "google-search-console", "linkedin", "x", "tiktok", "instagram", "facebook"].includes(item.provider));
  const gscByBrand = await Promise.all(brands.map((brand) => getSearchPerformanceForBrand(brand.name)));

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description="Google Search Console is the first real read-only connector — one per brand (GridFactory.io and Gulf-EL.com). Cards below remain sample data until each source is connected; no live posting anywhere."
      />

      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-command" />
          <h2 className="text-lg font-semibold">Search Console — per brand</h2>
          <Badge tone="blue">read-only</Badge>
        </div>
        {gscByBrand.map((gsc) => (
          <Panel key={gsc.brand} className="border-l-4 border-l-command">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{gsc.brand}</h3>
                <Badge tone={gsc.connected ? "green" : "neutral"}>{gsc.connected ? "live" : "not connected"}</Badge>
              </div>
              {gsc.connected && gsc.range ? (
                <span className="text-xs text-slate-500">
                  {gsc.site} · {gsc.range.start} → {gsc.range.end}
                </span>
              ) : null}
            </div>

            {gsc.connected ? (
              <>
                <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Clicks" value={gsc.totals?.clicks ?? 0} detail="Last 28 days (GSC)" />
                  <StatCard label="Impressions" value={gsc.totals?.impressions ?? 0} detail="Last 28 days (GSC)" />
                  <StatCard label="Avg CTR" value={`${((gsc.totals?.ctr ?? 0) * 100).toFixed(1)}%`} detail="Top queries" />
                  <StatCard label="Avg position" value={(gsc.totals?.position ?? 0).toFixed(1)} detail="Top queries" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">Query</th>
                        <th className="py-2 pr-3 text-right">Clicks</th>
                        <th className="py-2 pr-3 text-right">Impr.</th>
                        <th className="py-2 pr-3 text-right">CTR</th>
                        <th className="py-2 text-right">Pos.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsc.rows.map((row) => (
                        <tr key={row.keys.join("|")} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 font-medium">{row.keys[0]}</td>
                          <td className="py-2 pr-3 text-right">{row.clicks}</td>
                          <td className="py-2 pr-3 text-right">{row.impressions}</td>
                          <td className="py-2 pr-3 text-right">{(row.ctr * 100).toFixed(1)}%</td>
                          <td className="py-2 text-right">{row.position.toFixed(1)}</td>
                        </tr>
                      ))}
                      {gsc.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-sm text-slate-500">
                            No query rows returned for this window.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                {gsc.reason ?? "Not connected."} Set this brand&apos;s server-side token + site
                (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">GOOGLE_SEARCH_CONSOLE_TOKEN_…</code> /{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">_SITE_…</code>), e.g. site{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">sc-domain:gridfactory.io</code>.
              </div>
            )}
          </Panel>
        ))}
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Sample data (until connectors are live)</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Impressions" value="42.8k" detail="+18% mock week over week" />
        <StatCard label="Engagement" value="5.6%" detail="Investor posts outperforming baseline" />
        <StatCard label="Clicks" value="1,284" detail="312 attributed to NexRide market note" />
        <StatCard label="Leads" value="47" detail="Mock inbound investor and fleet signals" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel>
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-command" />
            <h2 className="text-lg font-semibold">Channel Momentum</h2>
          </div>
          <div className="space-y-5">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium">{bar.label}</span>
                  <span className="text-slate-500">{bar.value}%</span>
                </div>
                <div className="h-3 rounded-md bg-slate-100 dark:bg-slate-800">
                  <div className="h-3 rounded-md bg-command" style={{ width: `${bar.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <h2 className="text-lg font-semibold">Top Content</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Five Signals of Bankable Grid Capacity generated the strongest executive saves and investor clicks.
            </p>
          </Panel>
          <Panel>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-rose-600" />
              <h2 className="text-lg font-semibold">Weak Content</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Early NexRide visual concept needs clearer driver economics before production.
            </p>
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel>
          <MousePointerClick className="h-5 w-5 text-command" />
          <h2 className="mt-3 text-lg font-semibold">Click Attribution</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Mock UTM and post-level reporting surface for future social integrations.</p>
        </Panel>
        <Panel>
          <Users className="h-5 w-5 text-command" />
          <h2 className="mt-3 text-lg font-semibold">Lead Quality</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Placeholder for CRM scoring and agent-generated follow-up recommendations.</p>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Connector Readiness</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Analytics will read from these connectors when live API pulls are enabled.</p>
            </div>
            <Badge tone="blue">read scaffold</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analyticsConnectors.map((connector) => (
              <div key={connector.provider} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{connector.display_name}</div>
                  <Badge tone={connector.configured ? "green" : "neutral"}>{connector.configured ? connector.status : "not configured"}</Badge>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Last checked: {connector.last_checked_at ? new Date(connector.last_checked_at).toLocaleString() : "Never"}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
