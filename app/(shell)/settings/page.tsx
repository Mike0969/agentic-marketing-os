import { ModelsControlCenter } from "@/components/os/models-control-center";
import { SocialConnections } from "@/components/os/social-connections";
import { PageHeading } from "@/components/os/ui";
import { PROVIDERS } from "@/lib/providers";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Settings · Models"
        subtitle="Provider control center. Status, model lists, and test calls are live server-side checks; secrets remain in environment variables only."
      />
      <ModelsControlCenter providers={PROVIDERS} />
      <SocialConnections />
    </>
  );
}
