import { ConversionAnalyzeAction } from "@/components/os/conversion-analyze-action";
import { ConversionLogForm } from "@/components/os/conversion-log-form";
import { GscPullAction } from "@/components/os/gsc-pull-action";
import { LeadLogForm } from "@/components/os/lead-log-form";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { countLeads, getLeads, type LeadRow } from "@/lib/marketing/leads";
import { getConversionMemoryContext, getLatestConversionOutcomes, type ConversionInsight } from "@/lib/marketing/conversion-memory";

export const dynamic = "force-dynamic";

type OutcomeRow = {
  id: string;
  brand_id: string;
  campaign_id: string | null;
  source: string;
  awareness: number;
  signups: number;
  activations: number;
  paid: number;
  revenue: number;
  signup_rate: number | null;
  paid_conversion_rate: number | null;
  created_at: string;
};

function pct(v: number | null) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function money(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

export default async function SalesPage() {
  const data = await getDashboardData();

  const perBrand = await Promise.all(
    data.brands.map(async (b) => ({
      brand: b,
      outcomes: (await getLatestConversionOutcomes(b.id)) as OutcomeRow[],
      leads: await getLeads(b.id, 15),
      leadCount: await countLeads(b.id),
      memory: await getConversionMemoryContext({ brandId: b.id })
    }))
  );

  const campaignTitle = new Map(data.campaigns.map((c) => [c.id, c.title]));
  const allOutcomes = perBrand.flatMap((p) => p.outcomes);
  const allLeads: Array<{ brand: string; lead: LeadRow }> = perBrand.flatMap((p) =>
    p.leads.map((lead) => ({ brand: p.brand.name, lead }))
  ).sort((a, b) => Date.parse(b.lead.created_at) - Date.parse(a.lead.created_at));
  const allInsights: Array<{ brand: string; insight: ConversionInsight }> = perBrand.flatMap((p) =>
    p.memory.insights.map((insight) => ({ brand: p.brand.name, insight }))
  );
  const realLeadCount = perBrand.reduce((sum, p) => sum + p.leadCount, 0);

  const agg = allOutcomes.reduce(
    (a, o) => ({
      awareness: a.awareness + (o.awareness || 0),
      activations: a.activations + (o.activations || 0),
      paid: a.paid + (o.paid || 0),
      revenue: a.revenue + (Number(o.revenue) || 0)
    }),
    { awareness: 0, activations: 0, paid: 0, revenue: 0 }
  );
  const investorRate = realLeadCount ? `${((agg.paid / realLeadCount) * 100).toFixed(1)}%` : "—";

  return (
    <>
      <PageHeading
        eyebrow="Capital OS"
        title="Investor Conversion Command Center"
        subtitle="Funnel: Reach → Lead → Investor → Capital($). What raises investor interest and committed capital feeds back into Crina's next campaign. Manual + agent-estimated; no live posting."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <GscPullAction />
            <ConversionAnalyzeAction brands={data.brands} />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OSMetric label="Reach" value={agg.awareness} hint="impressions / visits" />
        <OSMetric label="Leads" value={realLeadCount} hint="real form/manual leads" />
        <OSMetric label="Investors" value={agg.paid} hint="committed investors" />
        <OSMetric label="Capital committed" value={money(agg.revenue)} hint="stored in revenue field" />
        <OSMetric label="Investor conversion" value={investorRate} hint="investors / leads" />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Log investor outcomes</h2>
          <p className="mb-4 mt-1 text-sm text-neutral-500">Real numbers you know: reach, leads, investor conversations, committed investors, and capital committed. The Conversion agent estimates gaps conservatively.</p>
          <ConversionLogForm brands={data.brands} campaigns={data.campaigns} />
        </OSPanel>

        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">What raises capital</h2>
          <p className="mb-3 mt-1 text-sm text-neutral-500">Crina reads these when proposing ideas + writing posts: what turns leads into investors and committed capital.</p>
          {allInsights.length ? (
            <div className="space-y-2">
              {allInsights.slice(0, 8).map((row, idx) => (
                <div key={idx} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-neutral-500">{row.brand}</span>
                    {row.insight.paid_conversion_rate != null ? <OSBadge tone="ok">{pct(row.insight.paid_conversion_rate)} investor conv.</OSBadge> : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-neutral-200">{row.insight.insight}</p>
                  {row.insight.recommendation ? <p className="mt-1 text-xs text-cyan-300">→ {row.insight.recommendation}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No investor conversion insights yet. Log outcomes and click &quot;Analyze capital conversion.&quot;</p>
          )}
        </OSPanel>
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <OSPanel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-neutral-50">Leads</h2>
              <p className="mt-1 text-sm text-neutral-500">Recent form submissions and offline investor inquiries.</p>
            </div>
            <OSBadge tone="ok">{realLeadCount} total</OSBadge>
          </div>
          {allLeads.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wider text-neutral-500">
                    <th className="py-2 pr-3">Lead</th>
                    <th className="px-3">Segment</th>
                    <th className="px-3">Company</th>
                    <th className="px-3">Brand</th>
                    <th className="pl-3 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {allLeads.slice(0, 25).map(({ brand, lead }) => (
                    <tr key={lead.id} className="text-neutral-300">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-neutral-100">{lead.name || "Unnamed"}</div>
                        <div className="text-xs text-neutral-500">{lead.email}</div>
                      </td>
                      <td className="px-3">{lead.segment ? <OSBadge tone="info">{lead.segment}</OSBadge> : "—"}</td>
                      <td className="px-3">{lead.company || "—"}</td>
                      <td className="px-3">{brand}</td>
                      <td className="pl-3 text-right">{new Date(lead.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No real leads captured yet.</p>
          )}
        </OSPanel>

        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Log a lead</h2>
          <p className="mb-4 mt-1 text-sm text-neutral-500">Offline deck, memo, and call requests become real Leads for the conversion loop.</p>
          <LeadLogForm brands={data.brands} campaigns={data.campaigns} />
        </OSPanel>
      </div>

      <OSPanel>
        <h2 className="mb-3 text-lg font-semibold text-neutral-50">Per-campaign investor outcomes</h2>
        {allOutcomes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="px-3">Source</th>
                  <th className="px-3 text-right">Reach</th>
                  <th className="px-3 text-right">Leads</th>
                  <th className="px-3 text-right">Investors</th>
                  <th className="px-3 text-right">Lead rate</th>
                  <th className="px-3 text-right">Investor conv.</th>
                  <th className="pl-3 text-right">Capital</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {allOutcomes.slice(0, 30).map((o) => (
                  <tr key={o.id} className="text-neutral-300">
                    <td className="py-2 pr-3">{o.campaign_id ? campaignTitle.get(o.campaign_id) ?? "—" : "Brand-level"}</td>
                    <td className="px-3"><OSBadge tone={o.source === "manual" || o.source === "lead_capture" ? "ok" : "info"}>{o.source === "agent_estimated" ? "estimate" : o.source}</OSBadge></td>
                    <td className="px-3 text-right">{o.awareness}</td>
                    <td className="px-3 text-right">{o.signups}</td>
                    <td className="px-3 text-right">{o.paid}</td>
                    <td className="px-3 text-right">{pct(o.signup_rate)}</td>
                    <td className="px-3 text-right">{pct(o.paid_conversion_rate)}</td>
                    <td className="pl-3 text-right">{o.revenue ? money(Number(o.revenue)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No investor outcomes logged yet.</p>
        )}
      </OSPanel>
    </>
  );
}
