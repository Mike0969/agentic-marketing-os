import { NewCampaignFlow } from "@/components/os/new-campaign-flow";
import { PageHeading } from "@/components/os/ui";
import { STEP_AGENTS, estimateUsd, getBudgetStatus, usd } from "@/lib/budget/model-budget";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const [data, budget] = await Promise.all([getDashboardData(), getBudgetStatus()]);
  const estimate = await estimateUsd([...STEP_AGENTS.plan, ...STEP_AGENTS.perPlatform, ...STEP_AGENTS.runOverhead]).catch(() => 0);
  // The brand chosen in the header (data.brands puts it first).
  const brand = data.brands.find((item) => item.active) ?? null;
  return (
    <>
      <PageHeading eyebrow="Marketing" title="New campaign" subtitle="Write your idea. Crina plans it, Jev checks the plan, the agents make the posts, and you say Yes or Rework on each part." />
      {budget ? (
        <p className={`mb-4 rounded-md border px-3 py-2 text-sm ${budget.blockedUntil ? "border-red-500/40 bg-red-500/10 text-red-100" : "border-neutral-800 bg-neutral-900/60 text-neutral-300"}`}>
          {budget.blockedUntil
            ? `Hermes limit reached, resets at ${new Date(budget.blockedUntil).toISOString().slice(11, 16)} UTC. A new campaign will be refused until then.`
            : `Model spend today: ${usd(budget.usdToday)}${budget.perDayUsd === null ? " (no limit)" : ` of a ${usd(budget.perDayUsd)} cap`}. One single-platform campaign is estimated at up to ${usd(estimate)} with the models set in Agents.`}
        </p>
      ) : null}
      <NewCampaignFlow brandName={brand?.name ?? null} brandId={brand?.id ?? null} />
    </>
  );
}
