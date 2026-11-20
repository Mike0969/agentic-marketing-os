import { notFound } from "next/navigation";
import { CampaignReview } from "@/components/os/campaign-review";
import { CampaignStatusBar } from "@/components/os/campaign-status-bar";
import { markJobSeen, type CampaignJob } from "@/lib/marketing/campaign-jobs";
import { statusLine } from "@/lib/marketing/status-line";
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
  const job = (brief.job ?? null) as CampaignJob | null;
  const line = statusLine(campaign, posts, job);
  // Opening the campaign clears its notification in the header.
  if (job && job.state !== "running" && !job.seen_at) await markJobSeen(id);
  return (
    <>
      <PageHeading eyebrow="Review" title={campaign.title} subtitle={view.label} />
      <CampaignStatusBar campaignId={id} line={line} running={line.tone === "working" && job?.state === "running"} />
      <CampaignReview
        campaignId={id}
        stage={String(brief.stage ?? "planning")}
        idea={String(brief.idea ?? campaign.objective)}
        plan={(brief.plan ?? null) as never}
        planJev={(brief.plan_jev ?? null) as never}
        support={{ seo: summaryOf(brief.seo), analytics: summaryOf(brief.analytics) }}
        blocked={(brief.blocked as { reason?: string } | null)?.reason ?? null}
        blockedKind={(() => {
          const kind = (brief.blocked as { kind?: string } | null)?.kind;
          return kind === "failed" || kind === "moved" ? kind : "safety";
        })()}
        blockedInfo={(brief.blocked ?? null) as never}
        brand={{
          id: campaign.brand_id,
          options: data.brands.map((b) => ({ id: b.id, name: b.name })),
          canChange: !posts.some((p) => p.published_at || p.posting_status === "processing" || p.posting_status === "published")
        }}
        pending={posts.filter((item) => item.approval_status === "pending")}
        others={posts.filter((item) => item.approval_status !== "pending")}
      />
    </>
  );
}
