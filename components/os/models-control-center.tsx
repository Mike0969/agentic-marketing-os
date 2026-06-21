"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Bot, Brain, CheckCircle2, Cpu, Loader2, MessageSquare, RefreshCcw, Send, Server, TriangleAlert, Zap } from "lucide-react";
import { OSBadge, OSButton, OSField, OSPanel, OSSelect } from "@/components/os/ui";
import type { ProviderKey, ProviderKind, ProviderMeta, ProviderModel } from "@/lib/providers/types";

type HealthState = {
  provider: ProviderKey;
  kind: ProviderKind;
  configured: boolean;
  connected: boolean;
  status: "connected" | "not_configured" | "error";
  detail: string;
  model?: string;
  checkedAt: string;
  latencyMs: number | null;
};

type ModelsState = {
  provider: ProviderKey;
  kind: ProviderKind;
  source: "live" | "static";
  models: ProviderModel[];
};

type TestState = {
  ok: boolean;
  model: string;
  response: string;
  latencyMs: number;
  error: string | null;
};

const icons: Record<ProviderKey, React.ReactNode> = {
  hermes: <Brain className="h-5 w-5" />,
  anthropic: <Bot className="h-5 w-5" />,
  openai: <Zap className="h-5 w-5" />,
  deepseek: <Cpu className="h-5 w-5" />,
  glm: <Server className="h-5 w-5" />,
  ollama: <Server className="h-5 w-5" />,
  telegram: <Bell className="h-5 w-5" />,
  slack: <MessageSquare className="h-5 w-5" />
};

function statusTone(status?: HealthState["status"]): "ok" | "warn" | "danger" | "off" {
  if (status === "connected") return "ok";
  if (status === "error") return "danger";
  if (status === "not_configured") return "danger";
  return "off";
}

function statusLabel(health?: HealthState) {
  if (!health) return "Checking";
  if (health.connected) return "Connected";
  if (health.status === "not_configured") return "Not configured";
  return "Error";
}

export function ModelsControlCenter({ providers }: { providers: ProviderMeta[] }) {
  const [health, setHealth] = useState<Record<string, HealthState>>({});
  const [models, setModels] = useState<Record<string, ModelsState>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});

  const summary = useMemo(() => {
    const healthItems = Object.values(health);
    return {
      configured: healthItems.filter((item) => item.configured).length,
      connected: healthItems.filter((item) => item.connected).length
    };
  }, [health]);

  async function loadProvider(provider: ProviderMeta) {
    setLoading((current) => ({ ...current, [provider.key]: true }));
    try {
      const [healthResponse, modelsResponse] = await Promise.all([
        fetch(`/api/os/providers/${provider.key}/health`),
        fetch(`/api/os/providers/${provider.key}/models`)
      ]);
      const nextHealth = (await healthResponse.json()) as HealthState;
      const nextModels = (await modelsResponse.json()) as ModelsState;
      setHealth((current) => ({ ...current, [provider.key]: nextHealth }));
      setModels((current) => ({ ...current, [provider.key]: nextModels }));
      setSelectedModels((current) => ({
        ...current,
        [provider.key]: current[provider.key] || nextModels.models[0]?.id || provider.defaultModel || ""
      }));
    } finally {
      setLoading((current) => ({ ...current, [provider.key]: false }));
    }
  }

  async function loadAll() {
    await Promise.all(providers.map(loadProvider));
  }

  async function testProvider(provider: ProviderMeta) {
    setTesting((current) => ({ ...current, [provider.key]: true }));
    try {
      const response = await fetch(`/api/os/providers/${provider.key}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: provider.kind === "channel" ? "Agentic OS test message." : "Hello, confirm you are working.",
          model: selectedModels[provider.key]
        })
      });
      const result = (await response.json()) as TestState;
      setTests((current) => ({ ...current, [provider.key]: result }));
      await loadProvider(provider);
    } finally {
      setTesting((current) => ({ ...current, [provider.key]: false }));
    }
  }

  useEffect(() => {
    void loadAll();
    const id = window.setInterval(() => void loadAll(), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <OSPanel>
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Providers</div>
          <div className="mt-2 text-3xl font-semibold text-neutral-50">{providers.length}</div>
        </OSPanel>
        <OSPanel>
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Configured</div>
          <div className="mt-2 text-3xl font-semibold text-neutral-50">{summary.configured}</div>
        </OSPanel>
        <OSPanel>
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Connected</div>
          <div className="mt-2 text-3xl font-semibold text-neutral-50">{summary.connected}</div>
        </OSPanel>
      </div>

      <div className="flex justify-end">
        <OSButton variant="secondary" onClick={loadAll}>
          <RefreshCcw className="h-4 w-4" />
          Recheck
        </OSButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => {
          const providerHealth = health[provider.key];
          const providerModels = models[provider.key]?.models ?? [];
          const test = tests[provider.key];
          const busy = loading[provider.key] || testing[provider.key];

          return (
            <OSPanel key={provider.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-neutral-100 text-neutral-950">{icons[provider.key]}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-neutral-50">{provider.label}</h2>
                      <OSBadge tone="info">{provider.kind}</OSBadge>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">Configured via server environment only.</p>
                  </div>
                </div>
                <OSBadge tone={statusTone(providerHealth?.status)}>{busy && !providerHealth ? "Checking" : statusLabel(providerHealth)}</OSBadge>
              </div>

              <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="flex items-center gap-2 text-sm text-neutral-300">
                  {providerHealth?.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <TriangleAlert className="h-4 w-4 text-rose-400" />}
                  {providerHealth?.detail ?? "Checking provider status."}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  {providerHealth?.latencyMs != null ? `${providerHealth.latencyMs}ms` : "Latency unavailable"} ·{" "}
                  {providerHealth?.checkedAt ? new Date(providerHealth.checkedAt).toLocaleTimeString() : "Not checked"}
                </div>
                {providerHealth && !providerHealth.configured ? (
                  <div className="mt-3 text-sm text-rose-300">Add API key/config to `.env.local`: {provider.envKeys.join(", ")}</div>
                ) : null}
              </div>

              {provider.kind === "model" ? (
                <div className="mt-4">
                  <OSField label={`Models (${models[provider.key]?.source ?? "loading"})`}>
                    <OSSelect value={selectedModels[provider.key] ?? ""} onChange={(event) => setSelectedModels((current) => ({ ...current, [provider.key]: event.target.value }))}>
                      {providerModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                      {!providerModels.length ? <option value="">No models available</option> : null}
                    </OSSelect>
                  </OSField>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-400">Notification channel. No model list.</div>
              )}

              <div className="mt-4">
                <OSButton onClick={() => testProvider(provider)} disabled={busy || (provider.kind === "model" && !selectedModels[provider.key])}>
                  {testing[provider.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : provider.kind === "channel" ? <Send className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                  {provider.kind === "channel" ? "Send test message" : "Test"}
                </OSButton>
              </div>

              {test ? (
                <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-neutral-200">Test output</div>
                    <OSBadge tone={test.ok ? "ok" : "danger"}>{test.ok ? `${test.latencyMs}ms` : "Error"}</OSBadge>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-400">{test.ok ? test.response : test.error}</p>
                </div>
              ) : null}
            </OSPanel>
          );
        })}
      </div>
    </div>
  );
}
