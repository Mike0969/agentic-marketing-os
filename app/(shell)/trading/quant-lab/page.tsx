import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Trading OS" title="Quant Lab" subtitle="Strategy research, idea backlog, and backtest task tracking. Research only." panels={["Strategy ideas", "Backtest tasks"]} />;
}
