import { ModelBudgetPanel } from "@/components/os/model-budget-panel";
import { ChannelsManager } from "@/components/os/channels-manager";
import { ProvidersManager } from "@/components/os/providers-manager";
import { listChannels } from "@/lib/notify/channels";
import { listUserProviders } from "@/lib/providers/user-providers";
import { CALL_ESTIMATE, getBudgetStatus } from "@/lib/budget/model-budget";
import { peekJevStatus } from "@/lib/jev/status";
import { OSBadge, OSPanel } from "@/components/os/ui";
import { SocialConnections } from "@/components/os/social-connections";
import { PageHeading } from "@/components/os/ui";
import { PROVIDERS, isConfigured } from "@/lib/providers";

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
        title="Settings"
        subtitle="AI providers, notifications, the model budget and social accounts. Keys you add here are stored encrypted and never shown again."
      />
      {await (async () => {
        const jev = peekJevStatus(); // never blocks the page
        const at = jev.checkedAt ? new Date(jev.checkedAt).toISOString().slice(11, 16) + " UTC" : null;
        return (
          <OSPanel className="mb-6 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-neutral-50">Jev</h2>
            <OSBadge tone={jev.state === "ready" ? "ok" : jev.state === "not_configured" || jev.state === "checking" ? "off" : "danger"}>
              {jev.state === "ready" ? "Jev: ready" : jev.state === "not_configured" ? "Jev: not configured" : jev.state === "checking" ? "Jev: checking…" : "Jev: error"}
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
      {/* Hermes (the "brain" card) is not a provider Mihai adds keys for: not listed here, still an agent option. */}
      <ProvidersManager
        initialProviders={await listUserProviders().catch(() => [])}
        env={PROVIDERS.filter((p) => p.kind === "model" && p.key !== "hermes").map((p) => ({ key: p.key, label: p.label, configured: isConfigured(p.key), defaultModel: p.defaultModel ?? null }))}
      />
      <ChannelsManager
        initialChannels={await listChannels().catch(() => [])}
        env={{ telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID), slack: Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID) }}
      />
      <SocialConnections oauthStatus={oauthStatus} />
    </>
  );
}
