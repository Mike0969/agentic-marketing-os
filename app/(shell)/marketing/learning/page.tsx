import { LearningLibrary } from "@/components/os/learning-library";
import { PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { listLearningItems } from "@/lib/learning/library";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const [data, items] = await Promise.all([getDashboardData(), listLearningItems().catch(() => [])]);
  return (
    <>
      <PageHeading
        eyebrow="Marketing"
        title="Learning library"
        subtitle="Materials Crina and the agents learn from: ideas, YouTube and podcast links, images, documents. This is memory they read every time, not model training."
      />
      <LearningLibrary initialItems={items} brands={data.brands.map((b) => ({ id: b.id, name: b.name }))} />
    </>
  );
}
