"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, PlugZap, RefreshCw, Save } from "lucide-react";
import { Badge, buttonClass, inputClass, Panel } from "@/components/ui";
import { integrationProviders } from "@/lib/integrations";
import type { IntegrationConfig, IntegrationProvider } from "@/lib/types";

export function IntegrationSettings({ initialIntegrations }: { initialIntegrations: IntegrationConfig[] }) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const byProvider = new Map(integrations.map((item) => [item.provider, item]));

  async function save(provider: IntegrationProvider, formData: FormData) {
    setBusy(provider);
    setMessage(null);

    const metadata = {
      endpoint: String(formData.get("endpoint") ?? ""),
      account: String(formData.get("account") ?? ""),
      notes: String(formData.get("notes") ?? "")
    };

    const response = await fetch("/api/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        metadata,
        secret: String(formData.get("secret") ?? "")
      })
    });

    const payload = (await response.json()) as { integration?: IntegrationConfig; error?: string };
    setBusy(null);

    if (!response.ok || !payload.integration) {
      setMessage(payload.error ?? "Could not save integration.");
      return;
    }

    setIntegrations((current) => current.map((item) => (item.provider === provider ? payload.integration! : item)));
    setMessage(`${payload.integration.display_name} settings saved.`);
  }

  async function test(provider: IntegrationProvider) {
    setBusy(`${provider}:test`);
    setMessage(null);

    const response = await fetch(`/api/integrations/${provider}/test`, { method: "POST" });
    const payload = (await response.json()) as { status?: IntegrationConfig["status"]; message?: string; last_checked_at?: string; error?: string };
    setBusy(null);

    if (!response.ok || !payload.status) {
      setMessage(payload.error ?? "Connection test failed.");
      return;
    }

    setIntegrations((current) =>
      current.map((item) =>
        item.provider === provider
          ? {
              ...item,
              status: payload.status!,
              last_checked_at: payload.last_checked_at ?? new Date().toISOString()
            }
          : item
      )
    );
    setMessage(payload.message ?? "Connection test completed.");
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div className="rounded-md border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 shadow-panel dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {integrationProviders.map((provider) => {
          const integration = byProvider.get(provider.provider);
          const configured = integration?.configured ?? false;
          const status = integration?.status ?? "not_configured";

          return (
            <Panel key={provider.provider}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <PlugZap className="h-4 w-4 text-command" />
                    <h2 className="font-semibold">{provider.displayName}</h2>
                    {provider.recommended ? <Badge tone="green">Recommended</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{provider.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge tone={configured ? "green" : "neutral"}>{configured ? "configured" : "not configured"}</Badge>
                  <Badge tone={status === "connected" ? "green" : status === "error" ? "red" : status === "testable" ? "blue" : "neutral"}>{status}</Badge>
                </div>
              </div>

              <form className="mt-5 grid gap-3" action={(formData) => save(provider.provider, formData)}>
                <label className="block text-sm font-medium">
                  Endpoint or account URL
                  <input name="endpoint" className={`${inputClass} mt-2`} defaultValue={integration?.metadata?.endpoint ?? ""} placeholder="Optional" />
                </label>
                <label className="block text-sm font-medium">
                  Account / property / page ID
                  <input name="account" className={`${inputClass} mt-2`} defaultValue={integration?.metadata?.account ?? ""} placeholder="Optional" />
                </label>
                <label className="block text-sm font-medium">
                  {provider.secretLabel}
                  <div className="relative mt-2">
                    <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input name="secret" className={`${inputClass} pl-9`} placeholder={configured ? "Stored server-side" : "Paste secret once"} type="password" />
                  </div>
                </label>
                <label className="block text-sm font-medium">
                  Notes
                  <input name="notes" className={`${inputClass} mt-2`} defaultValue={integration?.metadata?.notes ?? ""} placeholder="Internal setup notes" />
                </label>

                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Last checked: {integration?.last_checked_at ? new Date(integration.last_checked_at).toLocaleString() : "Never"}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => test(provider.provider)} disabled={busy !== null}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {busy === `${provider.provider}:test` ? "Testing..." : "Test"}
                    </button>
                    <button type="submit" className={buttonClass} disabled={busy !== null}>
                      {busy === provider.provider ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                      {busy === provider.provider ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
