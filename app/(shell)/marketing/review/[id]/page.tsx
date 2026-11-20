import { notFound } from "next/navigation";
import { CampaignReview } from "@/components/os/campaign-review";
import { PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { flowView } from "@/lib/marketing/flow-view";

export const dynamic = "force-dynamic";

export default async function CampaignReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDashboardData();
  const campaign = data.campaigns.find((item) => item.id === id);
  if (!campaign) notFound();
  const brief = (campaign.idea_brief ?? {}) as Record<string, unknown>;
  const posts = data.contentItems.filter((item) => item.campaign_id === id && !item.archived_at);
  const summaryOf = (value: unknown) => (value && typeof value === "object" && typeof (value as { summary?: unknown }).summary === "string" ? String((value as { summary: string }).summary) : null);
  const view = flowView(campaign, data.contentItems);
  return (
    <>
      <PageHeading eyebrow="Review" title={campaign.title} subtitle={view.label} />
      <CampaignReview
        campaignId={id}
        stage={String(brief.stage ?? "planning")}
        idea={String(brief.idea ?? campaign.objective)}
        plan={(brief.plan ?? null) as never}
        planJev={(brief.plan_jev ?? null) as never}
        support={{ seo: summaryOf(brief.seo), analytics: summaryOf(brief.analytics) }}
        pending={posts.filter((item) => item.approval_status === "pending")}
        others={posts.filter((item) => item.approval_status !== "pending")}
      />
    </>
  );
}
