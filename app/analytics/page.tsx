import { BarChart3, MousePointerClick, TrendingDown, TrendingUp, Users } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { listIntegrationConfigs } from "@/lib/integration-store";

const bars = [
  { label: "GridFactory LinkedIn", value: 82 },
  { label: "NexRide Launch", value: 68 },
  { label: "GridFactory SEO", value: 54 },
  { label: "NexRide Instagram", value: 43 }
];

export default async function AnalyticsPage() {
  const integrations = await listIntegrationConfigs();
  const analyticsConnectors = integrations.filter((item) => ["ga4", "google-search-console", "linkedin", "x", "tiktok", "instagram", "facebook"].includes(item.provider));

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Analytics"
        description="Mock reporting cards for impressions, engagement, clicks, leads, top content, and weak content. Connect GA4, Search Console, and social APIs here."
      />
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
