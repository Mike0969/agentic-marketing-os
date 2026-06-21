import { SkeletonPage } from "@/components/os/ui";

export const dynamic = "force-dynamic";

export default function Page() {
  return <SkeletonPage eyebrow="Marketing OS" title="Brands" subtitle="Brand profiles, positioning, pillars, and CTAs. Reuses the Supabase brands table." panels={["Brand list", "Brand editor"]} />;
}
