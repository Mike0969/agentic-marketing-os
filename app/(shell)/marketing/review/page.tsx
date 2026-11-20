import Link from "next/link";
import { OSBadge, OSPanel, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { flowView, isSimpleFlow } from "@/lib/marketing/flow-view";

export const dynamic = "force-dynamic";

export default async function ReviewListPage() {
  const data = await getDashboardData();
  const views = data.campaigns.filter(isSimpleFlow).map((campaign) => flowView(campaign, data.contentItems));
  const waiting = views.filter((view) => view.needsMihai);
  const rest = views.filter((view) => !view.needsMihai);
  return (
    <>
      <PageHeading eyebrow="Marketing" title="Review" subtitle="One screen per campaign: say Yes or Rework on each part. Campaigns waiting for you are first." />
      {!views.length ? (
        <OSPanel>
          <p className="text-sm text-neutral-400">No campaigns yet. <Link className="text-cyan-300 underline" href="/marketing/new">Start one with your idea.</Link></p>
        </OSPanel>
      ) : null}
      <div className="space-y-3">
        {[...waiting, ...rest].map((view) => (
          <Link key={view.campaign.id} href={`/marketing/review/${view.campaign.id}`} className="block">
            <OSPanel className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-neutral-700">
              <div>
                <div className="font-semibold text-neutral-100">{view.campaign.title}</div>
                <div className="mt-1 text-sm text-neutral-400">{view.label}</div>
              </div>
              <OSBadge tone={view.needsMihai ? "warn" : "off"}>{view.needsMihai ? "Needs you" : `Step ${view.step} of 5`}</OSBadge>
            </OSPanel>
          </Link>
        ))}
      </div>
    </>
  );
}
