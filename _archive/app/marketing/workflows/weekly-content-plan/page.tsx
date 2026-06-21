import { WeeklyContentPlanWorkflow } from "@/components/weekly-content-plan-workflow";
import { PageHeader } from "@/components/ui";

export default function WeeklyContentPlanPage() {
  return (
    <>
      <PageHeader
        eyebrow="Crina Workflow"
        title="Generate Weekly Content Plan"
        description="Crina creates a weekly plan for GridFactory, Gulf-EL / NexRide, or both brands. Outputs enter the pipeline as Idea or Brief and require human approval later."
      />
      <WeeklyContentPlanWorkflow />
    </>
  );
}
