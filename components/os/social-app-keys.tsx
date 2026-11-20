"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { OSBadge, OSButton, OSInput, OSPanel } from "@/components/os/ui";

type Keys = { platform: "meta" | "linkedin" | "x" | "tiktok"; source: "settings" | "env" | "none"; clientId: string | null; secretLast4: string | null; secretSet: boolean };

const PLATFORMS: Record<Keys["platform"], { label: string; idLabel: string; secretLabel: string; where: string; redirectKeys: Array<{ label: string; key: string }> }> = {
  meta: {
    label: "Meta (Facebook + Instagram)",
    idLabel: "App ID",
    secretLabel: "App secret",
    where: "Meta for Developers → My Apps → your app → App settings → Basic: App ID + App secret. Paste both redirect URIs under Facebook Login → Settings → Valid OAuth Redirect URIs. Instagram uses the same Meta app.",
    redirectKeys: [{ label: "Facebook", key: "facebook" }, { label: "Instagram", key: "instagram" }]
  },
  linkedin: {
    label: "LinkedIn",
    idLabel: "Client ID",
    secretLabel: "Primary Client Secret",
    where: "LinkedIn Developers → My apps → your app → Auth: Client ID + Primary Client Secret. Paste the redirect URI under \"Authorized redirect URLs for your app\".",
    redirectKeys: [{ label: "LinkedIn", key: "linkedin" }]
  },
  x: {
    label: "X",
    idLabel: "OAuth 2.0 Client ID",
    secretLabel: "OAuth 2.0 Client Secret",
    where: "X Developer Portal → Projects & Apps → your app → Keys and tokens: OAuth 2.0 Client ID + Client Secret. Paste the redirect URI as the Callback URI in User authentication settings.",
    redirectKeys: [{ label: "X", key: "x" }]
  },
  tiktok: {
    label: "TikTok",
    idLabel: "Client key",
    secretLabel: "Client secret",
    where: "TikTok for Developers → Manage apps → your app: Client key + Client secret. Paste the redirect URI under Login Kit → Redirect URI.",
    redirectKeys: [{ label: "TikTok", key: "tiktok" }]
  }
};

export function SocialAppKeys({ initialKeys, redirectUris, highlight }: { initialKeys: Keys[]; redirectUris: Record<string, string>; highlight?: string | null }) {
  const [keys, setKeys] = useState(initialKeys);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(highlight ?? null);
  const [form, setForm] = useState({ clientId: "", clientSecret: "" });
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const say = (k: string, ok: boolean, text: string) => setStatus((s) => ({ ...s, [k]: { ok, text } }));

  async function call(method: "POST" | "DELETE", platform: string) {
    setBusy(platform);
    try {
      const res = await fetch(method === "DELETE" ? `/api/os/social-app-keys?platform=${platform}` : "/api/os/social-app-keys", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ platform, ...form }) : undefined
      });
      const body = (await res.json()) as { keys?: Keys[]; error?: string };
      if (!res.ok || !body.keys) throw new Error(body.error ?? "Failed.");
      setKeys(body.keys);
      setEditing(null);
      setForm({ clientId: "", clientSecret: "" });
      say(platform, true, method === "POST" ? "Saved. Now press Connect / Reconnect for the brand above." : "Removed.");
    } catch (error) {
      say(platform, false, error instanceof Error ? error.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <OSPanel className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-50">App keys</h2>
      <p className="mt-1 text-sm text-neutral-400">The developer-app keys each platform gives you. Secrets are stored encrypted; only the last 4 characters are shown. Copy the redirect URI into the platform&apos;s developer portal.</p>
      <div className="mt-4 space-y-3">
        {keys.map((k) => {
          const p = PLATFORMS[k.platform];
          const line = k.source === "settings" ? `${p.idLabel} ${k.clientId}${k.secretSet ? ` · secret …${k.secretLast4}` : ""} · set in Settings` : k.source === "env" ? `${p.idLabel} ${k.clientId} · from server environment` : "not set";
          const st = status[k.platform];
          return (
            <div key={k.platform} id={`app-keys-${k.platform}`} className={`scroll-mt-24 rounded-md border p-3 ${highlight === k.platform ? "border-amber-400/70 bg-amber-400/5" : "border-neutral-800 bg-neutral-950/60"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-56 font-medium text-neutral-100">{p.label}</span>
                <OSBadge tone={k.source === "none" ? "off" : "ok"}>{line}</OSBadge>
                <div className="ml-auto flex gap-2">
                  <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditing(editing === k.platform ? null : k.platform); setForm({ clientId: k.source === "settings" ? k.clientId ?? "" : "", clientSecret: "" }); }}>
                    <KeyRound className="h-3.5 w-3.5" /> {k.source === "none" ? "Add keys" : "Change"}
                  </OSButton>
                  {k.source === "settings" ? (
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove the ${p.label} keys set in Settings?`)) void call("DELETE", k.platform); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </OSButton>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {p.redirectKeys.map((r) => {
                  const uri = redirectUris[r.key] ?? "";
                  return (
                    <div key={r.key} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-neutral-500">Redirect URI{p.redirectKeys.length > 1 ? ` (${r.label})` : ""}:</span>
                      <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-200">{uri || "not set on the server"}</code>
                      {uri ? (
                        <button type="button" onClick={() => copy(uri, `${k.platform}:${r.key}`)} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-900" aria-label={`Copy ${r.label} redirect URI`}>
                          {copied === `${k.platform}:${r.key}` ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                          {copied === `${k.platform}:${r.key}` ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                <p className="text-xs text-neutral-500">Where to find the keys: {p.where}</p>
              </div>
              {editing === k.platform ? (
                <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void call("POST", k.platform); }}>
                  <OSInput value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder={p.idLabel} aria-label={`${p.label} ${p.idLabel}`} className="w-72" />
                  <OSInput type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={k.source === "settings" && k.secretSet ? `${p.secretLabel} (leave empty to keep …${k.secretLast4})` : p.secretLabel} aria-label={`${p.label} ${p.secretLabel}`} className="w-80" />
                  <OSButton type="submit" className="px-3 py-1.5 text-xs" disabled={busy !== null || !form.clientId.trim()}>
                    {busy === k.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
                  </OSButton>
                  <button type="button" className="text-xs text-neutral-400" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : null}
              {st ? <p className={`mt-1 text-xs ${st.ok ? "text-emerald-300" : "text-amber-300"}`}>{st.text}</p> : null}
            </div>
          );
        })}
      </div>
    </OSPanel>
  );
}
