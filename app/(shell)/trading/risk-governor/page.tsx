import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Trading OS" title="Risk Governor" subtitle="Exposure review and risk rules. Research/risk only — the Risk Governor never places broker orders." panels={["Exposure overview", "Risk rules"]} />;
}
