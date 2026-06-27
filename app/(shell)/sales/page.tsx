import { ConversionAnalyzeAction } from "@/components/os/conversion-analyze-action";
import { ConversionLogForm } from "@/components/os/conversion-log-form";
import { OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
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

export default async function SalesPage() {
  const data = await getDashboardData();

  const perBrand = await Promise.all(
    data.brands.map(async (b) => ({
      brand: b,
      outcomes: (await getLatestConversionOutcomes(b.id)) as OutcomeRow[],
      memory: await getConversionMemoryContext({ brandId: b.id })
    }))
  );

  const campaignTitle = new Map(data.campaigns.map((c) => [c.id, c.title]));
  const allOutcomes = perBrand.flatMap((p) => p.outcomes);
  const allInsights: Array<{ brand: string; insight: ConversionInsight }> = perBrand.flatMap((p) =>
    p.memory.insights.map((insight) => ({ brand: p.brand.name, insight }))
  );

  const agg = allOutcomes.reduce(
    (a, o) => ({
      awareness: a.awareness + (o.awareness || 0),
      signups: a.signups + (o.signups || 0),
      activations: a.activations + (o.activations || 0),
      paid: a.paid + (o.paid || 0),
      revenue: a.revenue + (Number(o.revenue) || 0)
    }),
    { awareness: 0, signups: 0, activations: 0, paid: 0, revenue: 0 }
  );
  const paidRate = agg.signups ? `${((agg.paid / agg.signups) * 100).toFixed(1)}%` : "—";

  return (
    <>
      <PageHeading
        eyebrow="Sales OS"
        title="Conversion Command Center"
        subtitle="Funnel: Awareness → Signup → Activation → Paid. What converts feeds back into Crina's next campaign. Manual + agent-estimated; no live posting."
        action={<ConversionAnalyzeAction brands={data.brands} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <OSMetric label="Awareness" value={agg.awareness} hint="reach / impressions" />
        <OSMetric label="Signups" value={agg.signups} hint="free" />
        <OSMetric label="Activations" value={agg.activations} hint="used it" />
        <OSMetric label="Paid" value={agg.paid} hint="converted" />
        <OSMetric label="Paid conversion" value={paidRate} hint="paid / signups (objective goal)" />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Log outcomes</h2>
          <p className="mb-4 mt-1 text-sm text-neutral-500">Real numbers you know. The Conversion agent estimates the rest.</p>
          <ConversionLogForm brands={data.brands} campaigns={data.campaigns} />
        </OSPanel>

        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">What&apos;s converting</h2>
          <p className="mb-3 mt-1 text-sm text-neutral-500">Crina reads these when proposing ideas + writing posts (the loop).</p>
          {allInsights.length ? (
            <div className="space-y-2">
              {allInsights.slice(0, 8).map((row, idx) => (
                <div key={idx} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider text-neutral-500">{row.brand}</span>
                    {row.insight.paid_conversion_rate != null ? <OSBadge tone="ok">{pct(row.insight.paid_conversion_rate)}</OSBadge> : null}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-neutral-200">{row.insight.insight}</p>
                  {row.insight.recommendation ? <p className="mt-1 text-xs text-cyan-300">→ {row.insight.recommendation}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No conversion insights yet. Log some outcomes and click &quot;Analyze conversion.&quot;</p>
          )}
        </OSPanel>
      </div>

      <OSPanel>
        <h2 className="mb-3 text-lg font-semibold text-neutral-50">Per-campaign outcomes</h2>
        {allOutcomes.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-3">Campaign</th>
                  <th className="px-3">Source</th>
                  <th className="px-3 text-right">Awareness</th>
                  <th className="px-3 text-right">Signups</th>
                  <th className="px-3 text-right">Paid</th>
                  <th className="px-3 text-right">Signup rate</th>
                  <th className="px-3 text-right">Paid conv.</th>
                  <th className="pl-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {allOutcomes.slice(0, 30).map((o) => (
                  <tr key={o.id} className="text-neutral-300">
                    <td className="py-2 pr-3">{o.campaign_id ? campaignTitle.get(o.campaign_id) ?? "—" : "Brand-level"}</td>
                    <td className="px-3"><OSBadge tone={o.source === "manual" ? "ok" : "info"}>{o.source === "manual" ? "manual" : "estimate"}</OSBadge></td>
                    <td className="px-3 text-right">{o.awareness}</td>
                    <td className="px-3 text-right">{o.signups}</td>
                    <td className="px-3 text-right">{o.paid}</td>
                    <td className="px-3 text-right">{pct(o.signup_rate)}</td>
                    <td className="px-3 text-right">{pct(o.paid_conversion_rate)}</td>
                    <td className="pl-3 text-right">{o.revenue ? `$${o.revenue}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No outcomes logged yet.</p>
        )}
      </OSPanel>
    </>
  );
}
