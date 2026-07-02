import { AssetLibrary } from "@/components/os/asset-library";
import { PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { listProjectAssets } from "@/lib/marketing/project-assets";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const [data, assets] = await Promise.all([getDashboardData(), listProjectAssets()]);
  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Project Asset Library"
        subtitle="Upload the real creative — images, video, carousels, decks, scripts, notes. Crina searches here before generating anything and reuses your approved assets to keep every post on-brand."
      />
      <AssetLibrary brands={data.brands} initialAssets={assets} />
    </>
  );
}
