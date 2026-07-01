import { Activity, BarChart3, Search, TrendingUp, Zap } from "lucide-react";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { getSearchPerformanceForBrand } from "@/lib/analytics/search-console";
import { getDashboardData } from "@/lib/data";
import { listIntegrationConfigs } from "@/lib/integration-store";
import { getConversionMemoryContext, getLatestConversionOutcomes } from "@/lib/marketing/conversion-memory";
import { resolvePlatform } from "@/lib/marketing/platform-specs";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type OutcomeRow = { awareness?: number; signups?: number; activations?: number; paid?: number; revenue?: number };
type FunnelSum = { awareness: number; signups: number; activations: number; paid: number; revenue: number };

export default async function AnalyticsPage() {
  const [integrations, data] = await Promise.all([listIntegrationConfigs(), getDashboardData()]);
  const gscByBrand = await Promise.all(data.brands.map((brand) => getSearchPerformanceForBrand(brand.name)));
  const analyticsConnectors = integrations.filter((item) => ["ga4", "google-search-console", "linkedin", "x", "tiktok", "instagram", "facebook"].includes(item.provider));

  // Real content output (platform-native packages produced by the loop).
  const items = data.contentItems.filter((item) => !item.archived_at);
  const published = items.filter((item) => item.status === "published").length;
  const scheduled = items.filter((item) => item.status === "scheduled").length;
  const pending = items.filter((item) => item.approval_status === "pending").length;
  const platformCounts = new Map<string, number>();
  for (const item of items) {
    const key = resolvePlatform(item.platform) ?? item.platform.toLowerCase();
    platformCounts.set(key, (platformCounts.get(key) ?? 0) + 1);
  }
  const platformBars = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]);
  const maxPlatform = Math.max(1, ...platformBars.map(([, count]) => count));

  // Real agent activity (Crina + specialists), the last 100 runs.
  const svc = createServiceClient();
  const { data: runsData } = svc
    ? await svc.from("agent_runs").select("status,agent_name,workflow_name,created_at").order("created_at", { ascending: false }).limit(100)
    : { data: [] as { status: string; agent_name: string; workflow_name: string; created_at: string }[] };
  const runs = runsData ?? [];
  const runSuccess = runs.filter((r) => r.status === "success").length;
  const runFallback = runs.filter((r) => r.status === "fallback").length;
  const runError = runs.filter((r) => r.status === "error").length;

  // Real conversion funnel per brand (Crina owns the analyst role). Agent-estimated until outcomes
  // are logged in Sales, so an all-zero funnel shows an honest empty state, never invented numbers.
  const conversion = await Promise.all(
    data.brands.map(async (brand) => {
      const outcomes = (await getLatestConversionOutcomes(brand.id, 50)) as OutcomeRow[];
      const sum = outcomes.reduce<FunnelSum>(
        (acc, o) => ({
          awareness: acc.awareness + (o.awareness ?? 0),
          signups: acc.signups + (o.signups ?? 0),
          activations: acc.activations + (o.activations ?? 0),
          paid: acc.paid + (o.paid ?? 0),
          revenue: acc.revenue + (o.revenue ?? 0)
        }),
        { awareness: 0, signups: 0, activations: 0, paid: 0, revenue: 0 }
      );
      const mem = await getConversionMemoryContext({ brandId: brand.id });
      return { brand: brand.name, sum, hasData: sum.awareness + sum.signups + sum.paid > 0, insights: mem.insights };
    })
  );

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Analytics"
        subtitle="Crina's analyst view: live Google Search Console, real platform-native output, agent activity, and the conversion funnel. No invented numbers — panels without a wired source show an honest empty state."
        action={<OSBadge tone="info">Crina-owned</OSBadge>}
      />

      {/* Real content output */}
      <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OSMetric label="Published" value={published} hint="Live posts" />
        <OSMetric label="Scheduled" value={scheduled} hint="On the calendar" />
        <OSMetric label="Pending approval" value={pending} hint="Awaiting your gate" />
        <OSMetric label="Agent runs" value={runs.length} hint="Last 100 recorded" />
      </div>

      {/* Search Console — the only live external metric */}
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-neutral-400" />
        <h2 className="text-lg font-semibold text-neutral-100">Search Console per brand</h2>
        <OSBadge tone="ok">Live data</OSBadge>
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

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Real output by platform */}
        <OSPanel>
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-neutral-400" />
              <h2 className="text-lg font-semibold text-neutral-100">Output by platform</h2>
            </div>
            <OSBadge tone="ok">Real</OSBadge>
          </div>
          {platformBars.length ? (
            <div className="space-y-4">
              {platformBars.map(([platform, count]) => (
                <div key={platform}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium capitalize text-neutral-200">{platform}</span>
                    <span className="text-neutral-500">{count}</span>
                  </div>
                  <div className="h-3 rounded-md bg-neutral-800">
                    <div className="h-3 rounded-md bg-cyan-400/70" style={{ width: `${(count / maxPlatform) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No packages produced yet.</p>
          )}
        </OSPanel>

        {/* Real agent activity */}
        <OSPanel>
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-neutral-400" />
              <h2 className="text-lg font-semibold text-neutral-100">Agent activity</h2>
            </div>
            <OSBadge tone="ok">Real</OSBadge>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <MiniStat label="Success" value={runSuccess} tone="text-emerald-400" />
            <MiniStat label="Fallback" value={runFallback} tone="text-amber-400" />
            <MiniStat label="Error" value={runError} tone="text-rose-400" />
          </div>
          <ul className="space-y-2">
            {runs.slice(0, 6).map((run, idx) => (
              <li key={`${run.created_at}-${idx}`} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-neutral-300">{run.agent_name} · {run.workflow_name}</span>
                <OSBadge tone={run.status === "success" ? "ok" : run.status === "fallback" ? "warn" : "danger"}>{run.status}</OSBadge>
              </li>
            ))}
            {!runs.length ? <li className="text-sm text-neutral-500">No agent runs recorded yet.</li> : null}
          </ul>
        </OSPanel>
      </div>

      {/* Real conversion funnel (the loop's objective metric) */}
      <div className="mb-3 mt-7 flex items-center gap-2">
        <Zap className="h-4 w-4 text-neutral-400" />
        <h2 className="text-lg font-semibold text-neutral-100">Conversion funnel per brand</h2>
        <OSBadge tone="info">Agent-estimated</OSBadge>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {conversion.map((c) => (
          <OSPanel key={c.brand}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-neutral-100">{c.brand}</h3>
              {c.hasData ? <OSBadge tone="ok">${c.sum.revenue.toLocaleString()} revenue</OSBadge> : <OSBadge tone="off">No outcomes yet</OSBadge>}
            </div>
            {c.hasData ? (
              <div className="grid grid-cols-4 gap-2">
                <FunnelStage label="Awareness" value={c.sum.awareness} />
                <FunnelStage label="Signups" value={c.sum.signups} />
                <FunnelStage label="Activations" value={c.sum.activations} />
                <FunnelStage label="Paid" value={c.sum.paid} />
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-neutral-800 bg-neutral-950 p-3 text-sm leading-6 text-neutral-400">
                No conversion outcomes logged yet. Log real outcomes in <span className="text-neutral-200">Sales</span> to activate the conversion loop — Crina feeds them back into idea + content generation.
              </p>
            )}
            {c.insights.length ? (
              <div className="mt-4 border-t border-neutral-800 pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> What&apos;s converting
                </div>
                <ul className="space-y-1.5 text-sm text-neutral-300">
                  {c.insights.slice(0, 3).map((insight, idx) => <li key={idx} className="leading-6">• {insight.insight}</li>)}
                </ul>
              </div>
            ) : null}
          </OSPanel>
        ))}
      </div>

      <OSPanel className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Connector Readiness</h2>
            <p className="mt-1 text-sm text-neutral-500">Google Search Console is the wired read-only source. Social connectors post; they don&apos;t yet report metrics back.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {analyticsConnectors.map((connector) => (
            <div key={connector.provider} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-neutral-200">{connector.display_name}</div>
                <OSBadge tone={connector.provider === "google-search-console" && connector.configured ? "ok" : "off"}>
                  {connector.provider === "google-search-console" && connector.configured ? connector.status : "No metrics feed"}
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

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-center">
      <div className={`text-2xl font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-neutral-500">{label}</div>
    </div>
  );
}

function FunnelStage({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-center">
      <div className="text-xl font-semibold text-neutral-50">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-neutral-500">{label}</div>
    </div>
  );
}
