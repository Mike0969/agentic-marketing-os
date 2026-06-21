import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Trading OS" title="FX Scanner" subtitle="FX majors vs USD — bias and strength signals from Hermes analysis. Research only, no orders." panels={["Signal table (EURUSD, GBPUSD, …)", "USD strength summary"]} />;
}
