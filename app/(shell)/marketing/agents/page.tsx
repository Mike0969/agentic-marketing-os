import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Agents" subtitle="Marketing agent roster + observability. Reuses the Supabase agents and agent_runs tables and the Hermes client." panels={["Agent roster", "Recent runs"]} />;
}
