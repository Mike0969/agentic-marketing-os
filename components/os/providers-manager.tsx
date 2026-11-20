"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { OSBadge, OSButton, OSKeyInput, OSPanel } from "@/components/os/ui";

type EnvProvider = { key: string; label: string; configured: boolean; defaultModel: string | null };
type UserProvider = {
  id: string; kind: string; label: string; name: string; base_url: string | null; key_last4: string; enabled: boolean;
  models_cache: string[]; models_cached_at: string | null; last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null;
};

// The providers Mihai can set a key for in place. GLM/Ollama appear only when the server has them.
const KNOWN = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "openrouter", label: "OpenRouter" },
  { key: "gemini", label: "Google Gemini" }
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
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [custom, setCustom] = useState({ open: false, name: "", baseUrl: "", apiKey: "" });

  const refresh = async () => setProviders((await api<{ providers: UserProvider[] }>("/api/os/model-providers")).providers);
  const say = (row: string, ok: boolean, text: string) => setStatus((s) => ({ ...s, [row]: { ok, text } }));
  const run = async (row: string, fn: () => Promise<void>) => {
    setBusy(row);
    try {
      await fn();
    } catch (error) {
      say(row, false, error instanceof Error ? error.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  const envFor = (key: string) => env.find((e) => e.key === key);
  const uiFor = (key: string) => providers.filter((p) => p.kind === key).sort((a, b) => Number(b.enabled) - Number(a.enabled))[0];
  const rows = [
    ...KNOWN,
    ...env.filter((e) => !KNOWN.some((k) => k.key === e.key) && e.configured).map((e) => ({ key: e.key, label: e.label }))
  ];
  const others = providers.filter((p) => p.kind === "custom" || p.id !== uiFor(p.kind)?.id);

  async function testRow(key: string, ui: UserProvider | undefined) {
    if (ui) {
      const t = await api<{ ok: boolean; detail: string }>(`/api/os/model-providers/${ui.id}/test`, { method: "POST" });
      await refresh();
      say(key, t.ok, t.detail);
      return;
    }
    const r = await api<{ ok?: boolean; error?: string | null; result?: { ok: boolean; error?: string | null } }>(`/api/os/providers/${key}/test`, { method: "POST", body: JSON.stringify({ prompt: "Reply with OK." }) });
    const ok = r.ok ?? r.result?.ok ?? false;
    say(key, ok, ok ? "Server key works." : `Server key failed: ${r.error ?? r.result?.error ?? ""}`);
  }

  async function saveKey(key: string, label: string, ui: UserProvider | undefined) {
    if (ui) await api(`/api/os/model-providers/${ui.id}`, { method: "PATCH", body: JSON.stringify({ apiKey: keyInput, enabled: true }) });
    else await api("/api/os/model-providers", { method: "POST", body: JSON.stringify({ kind: key, name: label, apiKey: keyInput }) });
    setKeyInput("");
    setEditing(null);
    await refresh();
    const fresh = (await api<{ providers: UserProvider[] }>("/api/os/model-providers")).providers.filter((p) => p.kind === key).sort((a, b) => Number(b.enabled) - Number(a.enabled))[0];
    await testRow(key, fresh);
  }

  return (
    <OSPanel className="mb-6">
      <h2 className="text-lg font-semibold text-neutral-50">Model providers</h2>
      <p className="mt-1 text-sm text-neutral-400">Change or add an API key right here. Keys are stored encrypted and only the last 4 characters are shown. A key set here is used instead of the one on the server.</p>

      <div className="mt-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
        {rows.map((row) => {
          const e = envFor(row.key);
          const ui = uiFor(row.key);
          const isSet = Boolean(ui) || Boolean(e?.configured);
          const line = ui ? `…${ui.key_last4} · set in Settings${ui.enabled ? "" : " · switched off"}` : e?.configured ? "from server environment" : "not set";
          const st = status[row.key];
          return (
            <div key={row.key} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-36 font-medium text-neutral-100">{row.label}</span>
                <OSBadge tone={isSet ? "ok" : "off"}>{line}</OSBadge>
                {ui?.models_cache.length ? <span className="text-xs text-neutral-500">{ui.models_cache.length} models</span> : null}
                <div className="ml-auto flex flex-wrap gap-2">
                  <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditing(editing === row.key ? null : row.key); setKeyInput(""); }}>
                    <KeyRound className="h-3.5 w-3.5" /> {isSet ? "Change key" : "Add key"}
                  </OSButton>
                  {isSet ? (
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(row.key, () => testRow(row.key, ui))}>
                      {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />} Test
                    </OSButton>
                  ) : null}
                  {ui ? (
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => {
                      if (!window.confirm(e?.configured ? `Remove the ${row.label} key set in Settings and go back to the server key?` : `Remove the ${row.label} key?`)) return;
                      void run(row.key, async () => {
                        await api(`/api/os/model-providers/${ui.id}`, { method: "DELETE" });
                        await refresh();
                        say(row.key, true, e?.configured ? "Back to the server key." : "Key removed.");
                      });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" /> {e?.configured ? "Use server key" : "Remove key"}
                    </OSButton>
                  ) : null}
                </div>
              </div>
              {editing === row.key ? (
                <div role="presentation" className="mt-2 flex flex-wrap items-center gap-2" onKeyDown={(ev) => { if (ev.key === "Enter" && busy === null && keyInput.trim().length >= 8) { ev.preventDefault(); void run(row.key, () => saveKey(row.key, row.label, ui)); } }}>
                  <OSKeyInput secret name={`${row.key}_provider_api_key`} value={keyInput} onChange={(ev) => setKeyInput(ev.target.value)} placeholder={`Paste the ${row.label} API key`} aria-label={`${row.label} API key`} className="w-96" />
                  <OSButton type="button" className="px-3 py-1.5 text-xs" disabled={busy !== null || keyInput.trim().length < 8} onClick={() => void run(row.key, () => saveKey(row.key, row.label, ui))}>
                    {busy === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save and test
                  </OSButton>
                  <button type="button" className="text-xs text-neutral-400" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : null}
              {st ? <p className={`mt-1 text-xs ${st.ok ? "text-emerald-300" : "text-amber-300"}`}>{st.text}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {others.map((p) => (
          <div key={p.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-neutral-800 p-3 text-sm">
            <span className="font-medium text-neutral-100">{p.name}</span>
            <OSBadge tone="off">{p.label}</OSBadge>
            <OSBadge tone={p.enabled ? "ok" : "off"}>…{p.key_last4}{p.enabled ? "" : " · off"}</OSBadge>
            {p.base_url ? <span className="text-xs text-neutral-500">{p.base_url}</span> : null}
            <div className="ml-auto flex gap-2">
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(p.id, async () => { const t = await api<{ ok: boolean; detail: string }>(`/api/os/model-providers/${p.id}/test`, { method: "POST" }); await refresh(); say(p.id, t.ok, t.detail); })}>
                <Zap className="h-3.5 w-3.5" /> Test
              </OSButton>
              <OSButton variant="danger" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove ${p.name}?`)) void run(p.id, async () => { await api(`/api/os/model-providers/${p.id}`, { method: "DELETE" }); await refresh(); }); }}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </OSButton>
            </div>
            {status[p.id] ? <p className={`w-full text-xs ${status[p.id].ok ? "text-emerald-300" : "text-amber-300"}`}>{status[p.id].text}</p> : null}
          </div>
        ))}
        {custom.open ? (
          <div role="presentation" className="mt-2 grid gap-2 rounded-md border border-neutral-800 p-3 md:grid-cols-4">
            <OSKeyInput name="custom_provider_name" placeholder="Name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} aria-label="Custom name" />
            <OSKeyInput name="custom_provider_base_url" placeholder="https://api.example.com/v1" value={custom.baseUrl} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} aria-label="Custom base URL" />
            <OSKeyInput secret name="custom_provider_api_key" placeholder="API key" value={custom.apiKey} onChange={(e) => setCustom({ ...custom, apiKey: e.target.value })} aria-label="Custom API key" />
            <OSButton type="button" className="px-3 py-1.5 text-xs" disabled={busy !== null || custom.apiKey.trim().length < 8 || !custom.baseUrl} onClick={() => void run("custom", async () => {
              const { provider } = await api<{ provider: UserProvider }>("/api/os/model-providers", { method: "POST", body: JSON.stringify({ kind: "custom", name: custom.name || "Custom", baseUrl: custom.baseUrl, apiKey: custom.apiKey }) });
              setCustom({ open: false, name: "", baseUrl: "", apiKey: "" });
              const t = await api<{ ok: boolean; detail: string }>(`/api/os/model-providers/${provider.id}/test`, { method: "POST" }).catch((err) => ({ ok: false, detail: String(err) }));
              await refresh();
              say(provider.id, t.ok, t.detail);
            })}>Save and test</OSButton>
          </div>
        ) : (
          <button type="button" className="mt-1 inline-flex items-center gap-1 text-sm text-cyan-300" onClick={() => setCustom({ ...custom, open: true })}>
            <Plus className="h-4 w-4" /> Add another OpenAI-compatible provider (custom URL)
          </button>
        )}
      </div>
    </OSPanel>
  );
}
