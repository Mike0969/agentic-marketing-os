import { ReadyToPostWorkspace } from "@/components/os/ready-to-post-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { getContentAssets } from "@/lib/marketing/ready-package";

export const dynamic = "force-dynamic";

export default async function ReadyToPostPage() {
  const data = await getDashboardData();
  const readyItems = data.contentItems.filter(
    (item) =>
      item.workflow_stage === "human_final_approval" ||
      item.approval_status === "pending" ||
      item.workflow_stage === "publishing_prep" ||
      item.status === "scheduled"
  );
  const assets = await getContentAssets(readyItems.map((item) => item.id));
  const pending = readyItems.filter((item) => item.approval_status === "pending").length;
  const approved = readyItems.filter((item) => item.approval_status === "approved" || item.status === "scheduled").length;
  const draftAssets = readyItems.filter((item) => !item.visual_asset_url || item.visual_asset_status === "placeholder").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Ready to Post"
        subtitle="Preview finished campaign packages, approve or send back with a reason, then export/copy manually. No social network posting is connected here."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Needs decision" value={pending} hint="Human final gate" />
        <OSMetric label="Ready manually" value={approved} hint="Approved draft packages" />
        <OSMetric label="Draft assets" value={draftAssets} hint="Fallback or placeholder media" />
      </div>
      <ReadyToPostWorkspace brands={data.brands} campaigns={data.campaigns} contentItems={readyItems} assets={assets} />
    </>
  );
}
