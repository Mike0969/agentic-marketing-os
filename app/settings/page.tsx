import { IntegrationSettings } from "@/components/integration-settings";
import { Badge, PageHeader } from "@/components/ui";
import { listIntegrationConfigs } from "@/lib/integration-store";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const integrations = await listIntegrationConfigs();
  const configuredCount = integrations.filter((item) => item.configured).length;

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Server-backed integration settings for model providers, Hermes, automation, social connectors, and analytics. Secret values are accepted by server routes and never rendered back to the browser."
        action={
          <div className="flex flex-wrap gap-2">
            <Badge tone={isSupabaseConfigured() ? "green" : "amber"}>{isSupabaseConfigured() ? "Supabase connected" : "Local fallback"}</Badge>
            <Badge tone={process.env.HERMES_AGENT_ENDPOINT ? "green" : "neutral"}>{process.env.HERMES_AGENT_ENDPOINT ? "Hermes endpoint set" : "Hermes fallback"}</Badge>
            <Badge tone="blue">{configuredCount} configured</Badge>
          </div>
        }
      />
      <IntegrationSettings initialIntegrations={integrations} />
    </>
  );
}
