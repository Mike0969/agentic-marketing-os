import { PipelineWorkspace } from "@/components/os/pipeline-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const data = await getDashboardData();
  const active = data.contentItems.filter((item) => ["idea", "brief", "draft", "visual", "approval", "scheduled"].includes(item.status));
  const fallback = active.filter((item) => item.performance_summary?.toUpperCase().includes("FALLBACK")).length;
  const approval = active.filter((item) => item.status === "approval").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Pipeline"
        subtitle="Idea → draft → visual → approval → scheduled. Send to agent creates drafts only; live publishing stays disabled."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Active cards" value={active.length} hint="Idea through scheduled" />
        <OSMetric label="Approval column" value={approval} hint="Human gate before scheduling" />
        <OSMetric label="Fallback drafts" value={fallback} hint="Visible and not treated as trusted" />
      </div>
      <PipelineWorkspace contentItems={active} brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
