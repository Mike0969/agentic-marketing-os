import { ReadyToPostWorkspace } from "@/components/os/ready-to-post-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { getContentAssets } from "@/lib/marketing/ready-package";
import { socialPostingEnabled } from "@/lib/social/posting";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function connectedLinkedinBrandIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return [];
  const { data } = await supabase.from("social_connections").select("brand_id").eq("platform", "linkedin").eq("status", "connected");
  return (data ?? []).map((r) => r.brand_id as string);
}

export default async function ReadyToPostPage() {
  const data = await getDashboardData();
  const postingEnabled = socialPostingEnabled();
  const connectedBrandIds = await connectedLinkedinBrandIds();
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
        subtitle={
          postingEnabled
            ? "Preview finished packages. Approve & Post publishes to a connected account on your explicit click only — or approve for manual export. Reject sends back to Crina with a reason."
            : "Preview finished packages, approve or send back with a reason, then export/copy manually. Live posting is off — enable it in Settings to publish."
        }
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Needs decision" value={pending} hint="Human final gate" />
        <OSMetric label="Ready manually" value={approved} hint="Approved draft packages" />
        <OSMetric label="Draft assets" value={draftAssets} hint="Fallback or placeholder media" />
      </div>
      <ReadyToPostWorkspace brands={data.brands} campaigns={data.campaigns} contentItems={readyItems} assets={assets} postingEnabled={postingEnabled} connectedBrandIds={connectedBrandIds} />
    </>
  );
}
