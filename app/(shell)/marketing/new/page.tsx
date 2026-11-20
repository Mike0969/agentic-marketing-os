import { NewCampaignFlow } from "@/components/os/new-campaign-flow";
import { PageHeading } from "@/components/os/ui";
import { CALL_ESTIMATE, getBudgetStatus } from "@/lib/budget/model-budget";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const [data, budget] = await Promise.all([getDashboardData(), getBudgetStatus()]);
  const estimate = CALL_ESTIMATE.plan + CALL_ESTIMATE.prepare + CALL_ESTIMATE.perPlatform + CALL_ESTIMATE.runOverhead;
  const brand = data.brands.find((item) => item.active) ?? null;
  return (
    <>
      <PageHeading eyebrow="Marketing" title="New campaign" subtitle="Write your idea. Crina plans it, Jev checks the plan, the agents make the posts, and you say Yes or Rework on each part." />
      {budget ? (
        <p className={`mb-4 rounded-md border px-3 py-2 text-sm ${budget.blockedUntil ? "border-red-500/40 bg-red-500/10 text-red-100" : "border-neutral-800 bg-neutral-900/60 text-neutral-300"}`}>
          {budget.blockedUntil
            ? `Hermes limit reached, resets at ${new Date(budget.blockedUntil).toISOString().slice(11, 16)} UTC. A new campaign will be refused until then.`
            : `Budget: ${budget.remainingToday} of ${budget.perDayMax} model calls left today. One single-platform campaign uses up to about ${estimate}.`}
        </p>
      ) : null}
      <NewCampaignFlow brandName={brand?.name ?? null} />
    </>
  );
}
