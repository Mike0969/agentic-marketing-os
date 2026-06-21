import { ApprovalsWorkspace } from "@/components/os/approvals-workspace";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const data = await getDashboardData();
  const gate1 = data.contentItems.filter((item) => item.status === "draft" && item.approval_status === "pending").length;
  const gate2 = data.contentItems.filter((item) => item.status === "approval").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Approvals"
        subtitle="Human approval gates for drafts and final packages. Approval never posts live; it only moves the item to the next internal stage."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Gate 1" value={gate1} hint="Draft review" />
        <OSMetric label="Gate 2" value={gate2} hint="Final review before scheduled draft" />
        <OSMetric label="Total waiting" value={gate1 + gate2} hint="Needs human decision" />
      </div>
      <ApprovalsWorkspace contentItems={data.contentItems} approvals={data.approvals} brands={data.brands} campaigns={data.campaigns} />
    </>
  );
}
