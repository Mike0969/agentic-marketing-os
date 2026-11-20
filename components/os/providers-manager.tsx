"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Plus, RefreshCcw, Trash2, TriangleAlert, Zap } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect } from "@/components/os/ui";

type EnvProvider = { key: string; label: string; configured: boolean; defaultModel: string | null };
type UserProvider = {
  id: string; kind: string; label: string; name: string; base_url: string | null; key_last4: string; enabled: boolean;
  models_cache: string[]; models_cached_at: string | null; last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null;
};

const KINDS = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "openrouter", label: "OpenRouter" },
  { key: "gemini", label: "Google Gemini" },
  { key: "custom", label: "Custom (OpenAI-compatible URL)" }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export function ProvidersManager({ initialProviders, env }: { initialProviders: UserProvider[]; env: EnvProvider[] }) {
  const [providers, setProviders] = useState(initialProviders);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "openai", name: "", apiKey: "", baseUrl: "" });
  const [replacing, setReplacing] = useState<Record<string, string>>({});
  const [openModels, setOpenModels] = useState<string | null>(null);
  const [envTest, setEnvTest] = useState<Record<string, string>>({});

  const replace = (p: UserProvider) => setProviders((cur) => cur.map((x) => (x.id === p.id ? p : x)));
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Failed." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <OSPanel className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-neutral-50">Model providers</h2>
          <p className="mt-1 text-sm text-neutral-400">Add, test, switch on/off or remove an AI provider. Keys are stored encrypted and never shown again (only the last 4 characters). A provider added here takes priority over the same provider set on the server.</p>
        </div>
        <OSButton onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Add provider
        </OSButton>
      </div>

      {message ? <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>{message.text}</p> : null}

      {adding ? (
        <form
          className="mt-4 grid gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run("add", async () => {
              const { provider } = await api<{ provider: UserProvider }>("/api/os/model-providers", { method: "POST", body: JSON.stringify(form) });
              setProviders((cur) => [...cur, provider]);
              setForm({ kind: "openai", name: "", apiKey: "", baseUrl: "" });
              setAdding(false);
              const t = await api<{ ok: boolean; detail: string }>(`/api/os/model-providers/${provider.id}/test`, { method: "POST" }).catch((e) => ({ ok: false, detail: String(e) }));
              const fresh = await api<{ providers: UserProvider[] }>("/api/os/model-providers");
              setProviders(fresh.providers);
              setMessage({ tone: t.ok ? "ok" : "warn", text: `${provider.name} added. ${t.detail}` });
            });
          }}
        >
          <OSField label="Provider">
            <OSSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Provider type">
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </OSSelect>
          </OSField>
          <OSField label="Name (optional)">
            <OSInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DeepSeek main" />
          </OSField>
          {form.kind === "custom" ? (
            <OSField label="Base URL (OpenAI-compatible)">
              <OSInput value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.example.com/v1" />
            </OSField>
          ) : null}
          <OSField label="API key">
            <OSInput type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="Paste the key" aria-label="API key" />
          </OSField>
          <div className="flex items-end">
            <OSButton type="submit" disabled={busy === "add" || form.apiKey.trim().length < 8}>
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save and test
            </OSButton>
          </div>
        </form>
      ) : null}

      <div className="mt-4 space-y-2">
        {providers.map((p) => (
          <div key={p.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-100">{p.name}</span>
              <OSBadge tone="off">{p.label}</OSBadge>
              <OSBadge tone={p.enabled ? "ok" : "off"}>{p.enabled ? "enabled" : "disabled"}</OSBadge>
              <span className="text-xs text-neutral-500">key …{p.key_last4}</span>
              {p.last_test_at ? (
                <span className={`inline-flex items-center gap-1 text-xs ${p.last_test_ok ? "text-emerald-300" : "text-amber-300"}`}>
                  {p.last_test_ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                  {p.last_test_detail}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(`test:${p.id}`, async () => {
                const t = await api<{ ok: boolean; detail: string }>(`/api/os/model-providers/${p.id}/test`, { method: "POST" });
                const fresh = await api<{ providers: UserProvider[] }>("/api/os/model-providers");
                setProviders(fresh.providers);
                setMessage({ tone: t.ok ? "ok" : "warn", text: `${p.name}: ${t.detail}` });
              })}>
                {busy === `test:${p.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Test
              </OSButton>
              <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => setOpenModels(openModels === p.id ? null : p.id)}>
                Models ({p.models_cache.length})
              </OSButton>
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(`toggle:${p.id}`, async () => {
                const { provider } = await api<{ provider: UserProvider }>(`/api/os/model-providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !p.enabled }) });
                replace(provider);
              })}>
                {p.enabled ? "Disable" : "Enable"}
              </OSButton>
              <OSInput type="password" autoComplete="off" className="w-48 px-2 py-1 text-xs" placeholder="New key to replace" value={replacing[p.id] ?? ""} onChange={(e) => setReplacing({ ...replacing, [p.id]: e.target.value })} aria-label={`Replace key for ${p.name}`} />
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null || (replacing[p.id] ?? "").trim().length < 8} onClick={() => void run(`key:${p.id}`, async () => {
                const { provider } = await api<{ provider: UserProvider }>(`/api/os/model-providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ apiKey: replacing[p.id] }) });
                replace(provider);
                setReplacing({ ...replacing, [p.id]: "" });
                setMessage({ tone: "ok", text: `${p.name}: key replaced (…${provider.key_last4}). Press Test.` });
              })}>
                <KeyRound className="h-3.5 w-3.5" /> Replace key
              </OSButton>
              <OSButton variant="danger" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => {
                if (!window.confirm(`Remove ${p.name}? Agents using it will need another model.`)) return;
                void run(`del:${p.id}`, async () => {
                  await api(`/api/os/model-providers/${p.id}`, { method: "DELETE" });
                  setProviders((cur) => cur.filter((x) => x.id !== p.id));
                  setMessage({ tone: "ok", text: `${p.name} removed.` });
                });
              }}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </OSButton>
            </div>
            {openModels === p.id ? (
              <div className="mt-2 rounded-md border border-neutral-800 p-2 text-xs text-neutral-400">
                <div className="mb-1 flex items-center justify-between">
                  <span>{p.models_cached_at ? `Listed ${new Date(p.models_cached_at).toLocaleString()}` : "Not listed yet"}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-cyan-300" onClick={() => void run(`models:${p.id}`, async () => {
                    await api(`/api/os/model-providers/${p.id}/models`, { method: "POST" });
                    const fresh = await api<{ providers: UserProvider[] }>("/api/os/model-providers");
                    setProviders(fresh.providers);
                  })}>
                    <RefreshCcw className="h-3.5 w-3.5" /> Refresh
                  </button>
                </div>
                {p.models_cache.length ? p.models_cache.join(" · ") : "No chat models listed. Press Test or Refresh."}
              </div>
            ) : null}
          </div>
        ))}

        {env.map((e) => (
          <div key={e.key} className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-800/70 bg-neutral-950/30 p-3">
            <span className="font-medium text-neutral-300">{e.label}</span>
            <OSBadge tone="off">from server environment</OSBadge>
            <OSBadge tone={e.configured ? "ok" : "off"}>{e.configured ? "configured" : "not set"}</OSBadge>
            {providers.some((p) => p.kind === e.key && p.enabled) ? <span className="text-xs text-amber-300">overridden by a provider added above</span> : null}
            {e.configured ? (
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(`env:${e.key}`, async () => {
                const r = await api<{ ok?: boolean; error?: string | null; result?: { ok: boolean; error?: string | null } }>(`/api/os/providers/${e.key}/test`, { method: "POST", body: JSON.stringify({ prompt: "Reply with OK." }) });
                const ok = r.ok ?? r.result?.ok ?? false;
                setEnvTest({ ...envTest, [e.key]: ok ? "test OK" : `test failed: ${r.error ?? r.result?.error ?? ""}` });
              })}>
                {busy === `env:${e.key}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Test
              </OSButton>
            ) : null}
            {envTest[e.key] ? <span className="text-xs text-neutral-400">{envTest[e.key]}</span> : null}
          </div>
        ))}
      </div>
    </OSPanel>
  );
}
