import { ModelsControlCenter } from "@/components/os/models-control-center";
import { SocialConnections } from "@/components/os/social-connections";
import { PageHeading } from "@/components/os/ui";
import { PROVIDERS } from "@/lib/providers";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const oauthStatus = {
    x: first(params.x),
    x_detail: first(params.x_detail),
    facebook: first(params.facebook),
    facebook_detail: first(params.facebook_detail),
    instagram: first(params.instagram),
    instagram_detail: first(params.instagram_detail),
    tiktok: first(params.tiktok),
    tiktok_detail: first(params.tiktok_detail)
  };

  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Settings · Models"
        subtitle="Provider control center. Status, model lists, and test calls are live server-side checks; secrets remain in environment variables only."
      />
      <ModelsControlCenter providers={PROVIDERS} />
      <SocialConnections oauthStatus={oauthStatus} />
    </>
  );
}
