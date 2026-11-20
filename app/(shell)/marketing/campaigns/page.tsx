import Link from "next/link";
import { IdeasBoard } from "@/components/os/ideas-board";
import { OSBadge, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

const STATUSES = ["planning", "active", "paused", "completed"];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = status && STATUSES.includes(status) ? status : null;
  const data = await getDashboardData();
  const campaigns = filter ? data.campaigns.filter((campaign) => campaign.status === filter) : data.campaigns;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Campaigns"
        subtitle="Every campaign. To start a new one, use Marketing → New campaign. Nothing posts live."
      />
      {filter ? (
        <div className="mb-4 flex items-center gap-2 text-sm text-neutral-400">
          <OSBadge tone="info">Showing: {filter === "planning" ? "draft objectives (planning)" : filter}</OSBadge>
          <Link href="/marketing/campaigns" className="text-cyan-300 underline">Show all</Link>
        </div>
      ) : null}
      <IdeasBoard key={filter ?? "all"} brands={data.brands} campaigns={campaigns} />
    </>
  );
}
