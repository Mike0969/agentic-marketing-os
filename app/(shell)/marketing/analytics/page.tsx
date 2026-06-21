import { BarChart3, MousePointerClick, Search, TrendingDown, TrendingUp, Users } from "lucide-react";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { getDashboardData } from "@/lib/data";
import { listIntegrationConfigs } from "@/lib/integration-store";

export const dynamic = "force-dynamic";

const sampleBars = [
  { label: "GridFactory LinkedIn", value: 82 },
  { label: "NexRide Launch", value: 68 },
  { label: "GridFactory SEO", value: 54 },
  { label: "NexRide Instagram", value: 43 }
];

export default async function AnalyticsPage() {
  const [integrations, data] = await Promise.all([listIntegrationConfigs(), getDashboardData()]);
  const gscByBrand = await Promise.all(data.brands.map((brand) => getSearchPerformanceForBrand(brand.name)));
  const analyticsConnectors = integrations.filter((item) => ["ga4", "google-search-console", "linkedin", "x", "tiktok", "instagram", "facebook"].includes(item.provider));

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Analytics"
        subtitle="Google Search Console is the real read-only connector. All other analytics panels are sample data until their source is wired."
        action={<OSBadge tone="info">GSC read-only</OSBadge>}
      />

      <div className="mb-5 flex items-center gap-2">
        <Search className="h-4 w-4 text-neutral-400" />
        <h2 className="text-lg font-semibold text-neutral-100">Search Console per brand</h2>
        <OSBadge tone="ok">Real data</OSBadge>
      </div>

      <div className="space-y-4">
        {gscByBrand.map((gsc) => (
          <OSPanel key={gsc.brand} className="border-l-4 border-l-neutral-500">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-100">{gsc.brand}</h3>
                <OSBadge tone={gsc.connected ? "ok" : "off"}>{gsc.connected ? "Live" : "Not connected"}</OSBadge>
              </div>
              {gsc.connected && gsc.range ? <span className="text-xs text-neutral-500">{gsc.site} · {gsc.range.start} to {gsc.range.end}</span> : null}
            </div>

            {gsc.connected ? (
              <>
                <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <OSMetric label="Clicks" value={gsc.totals?.clicks ?? 0} hint="Last 28 days GSC" />
                  <OSMetric label="Impressions" value={gsc.totals?.impressions ?? 0} hint="Last 28 days GSC" />
                  <OSMetric label="Avg CTR" value={`${((gsc.totals?.ctr ?? 0) * 100).toFixed(1)}%`} hint="Top queries" />
                  <OSMetric label="Avg position" value={(gsc.totals?.position ?? 0).toFixed(1)} hint="Top queries" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-neutral-500">
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
                        <tr key={row.keys.join("|")} className="border-t border-neutral-800">
                          <td className="py-2 pr-3 font-medium text-neutral-200">{row.keys[0]}</td>
                          <td className="py-2 pr-3 text-right text-neutral-300">{row.clicks}</td>
                          <td className="py-2 pr-3 text-right text-neutral-300">{row.impressions}</td>
                          <td className="py-2 pr-3 text-right text-neutral-300">{(row.ctr * 100).toFixed(1)}%</td>
                          <td className="py-2 text-right text-neutral-300">{row.position.toFixed(1)}</td>
                        </tr>
                      ))}
                      {gsc.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-3 text-sm text-neutral-500">No query rows returned for this window.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed border-neutral-800 bg-neutral-950 p-4 text-sm leading-6 text-neutral-400">
                {gsc.reason ?? "Not connected."} Configure this brand&apos;s server-side Google Search Console credentials and site. No browser secrets are exposed.
              </div>
            )}
          </OSPanel>
        ))}
      </div>

      <div className="mb-2 mt-7 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Sample data
        <OSBadge tone="demo">SAMPLE DATA</OSBadge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SampleMetric label="Impressions" value="42.8k" detail="+18% sample week over week" />
        <SampleMetric label="Engagement" value="5.6%" detail="Investor posts outperforming baseline" />
        <SampleMetric label="Clicks" value="1,284" detail="312 attributed to NexRide market note" />
        <SampleMetric label="Leads" value="47" detail="Sample inbound investor and fleet signals" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <OSPanel>
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-neutral-400" />
              <h2 className="text-lg font-semibold text-neutral-100">Channel Momentum</h2>
            </div>
            <OSBadge tone="demo">SAMPLE DATA</OSBadge>
          </div>
          <div className="space-y-5">
            {sampleBars.map((bar) => (
              <div key={bar.label}>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium text-neutral-200">{bar.label}</span>
                  <span className="text-neutral-500">{bar.value}%</span>
                </div>
                <div className="h-3 rounded-md bg-neutral-800">
                  <div className="h-3 rounded-md bg-neutral-300" style={{ width: `${bar.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </OSPanel>

        <div className="grid gap-5">
          <SamplePanel icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} title="Top Content">
            Five Signals of Bankable Grid Capacity generated the strongest executive saves and investor clicks.
          </SamplePanel>
          <SamplePanel icon={<TrendingDown className="h-4 w-4 text-rose-400" />} title="Weak Content">
            Early NexRide visual concept needs clearer driver economics before production.
          </SamplePanel>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <SamplePanel icon={<MousePointerClick className="h-5 w-5 text-neutral-400" />} title="Click Attribution">
          Sample UTM and post-level reporting surface for future social integrations.
        </SamplePanel>
        <SamplePanel icon={<Users className="h-5 w-5 text-neutral-400" />} title="Lead Quality">
          Placeholder for CRM scoring and agent-generated follow-up recommendations.
        </SamplePanel>
      </div>

      <OSPanel className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Connector Readiness</h2>
            <p className="mt-1 text-sm text-neutral-500">Only Google Search Console is wired in this sprint.</p>
          </div>
          <OSBadge tone="demo">Scaffold list</OSBadge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analyticsConnectors.map((connector) => (
            <div key={connector.provider} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-neutral-200">{connector.display_name}</div>
                <OSBadge tone={connector.provider === "google-search-console" && connector.configured ? "ok" : "demo"}>
                  {connector.provider === "google-search-console" && connector.configured ? connector.status : "SAMPLE DATA"}
                </OSBadge>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Last checked: {connector.last_checked_at ? new Date(connector.last_checked_at).toLocaleString() : "Never"}</div>
            </div>
          ))}
          {!analyticsConnectors.length ? <div className="rounded-md border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">No connector metadata saved yet.</div> : null}
        </div>
      </OSPanel>
    </>
  );
}

function SampleMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <OSPanel>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
        <OSBadge tone="demo">SAMPLE DATA</OSBadge>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-50">{value}</div>
      <div className="mt-1 text-sm text-neutral-400">{detail}</div>
    </OSPanel>
  );
}

function SamplePanel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <OSPanel>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
        </div>
        <OSBadge tone="demo">SAMPLE DATA</OSBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-neutral-400">{children}</p>
    </OSPanel>
  );
}
