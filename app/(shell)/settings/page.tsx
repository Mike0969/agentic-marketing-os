import { ModelBudgetPanel } from "@/components/os/model-budget-panel";
import { ModelsControlCenter } from "@/components/os/models-control-center";
import { CALL_ESTIMATE, getBudgetStatus } from "@/lib/budget/model-budget";
import { getJevStatus } from "@/lib/jev/status";
import { OSBadge, OSPanel } from "@/components/os/ui";
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
      {await (async () => {
        const jev = await getJevStatus();
        const at = jev.checkedAt ? new Date(jev.checkedAt).toISOString().slice(11, 16) + " UTC" : null;
        return (
          <OSPanel className="mb-6 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-50">Jev</h2>
            <OSBadge tone={jev.state === "ready" ? "ok" : jev.state === "not_configured" ? "off" : "danger"}>
              {jev.state === "ready" ? "Jev: ready" : jev.state === "not_configured" ? "Jev: not configured" : "Jev: error"}
            </OSBadge>
            <span className="text-sm text-neutral-400">
              {jev.state === "ready" ? `Smoke check ${at}: ${jev.detail}.` : jev.detail}
            </span>
          </OSPanel>
        );
      })()}
      <ModelBudgetPanel
        initial={await getBudgetStatus()}
        campaignEstimate={CALL_ESTIMATE.plan + CALL_ESTIMATE.prepare + CALL_ESTIMATE.perPlatform + CALL_ESTIMATE.runOverhead + 2 * CALL_ESTIMATE.rework}
      />
      <ModelsControlCenter providers={PROVIDERS} />
      <SocialConnections oauthStatus={oauthStatus} />
    </>
  );
}
