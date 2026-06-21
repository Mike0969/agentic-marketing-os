import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <SkeletonPage
      eyebrow="Agentic OS"
      title="Settings"
      subtitle="Connections and configuration. Wired connectors (Hermes, Google Search Console) will be shown as live; everything else is clearly marked as a scaffold."
      panels={["Connections (Hermes, GSC live)", "Models & preferences"]}
    />
  );
}
