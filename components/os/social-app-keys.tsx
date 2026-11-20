"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2 } from "lucide-react";
import { OSBadge, OSButton, OSKeyInput, OSPanel } from "@/components/os/ui";

type Platform = "facebook" | "instagram" | "linkedin" | "x" | "tiktok";
type Keys = {
  platform: Platform;
  source: "settings" | "env" | "none";
  clientId: string | null;
  secretLast4: string | null;
  secretSet: boolean;
  usesFacebook?: boolean;
  usesFacebookChosen?: boolean;
};

const PLATFORMS: Record<Platform, { label: string; idLabel: string; secretLabel: string; where: string }> = {
  facebook: {
    label: "Facebook (Pages)",
    idLabel: "App ID",
    secretLabel: "App secret",
    where: "Meta for Developers → My Apps → your app → App settings → Basic: App ID + App secret. Paste the redirect URI under Facebook Login → Settings → Valid OAuth Redirect URIs."
  },
  instagram: {
    label: "Instagram",
    idLabel: "App ID",
    secretLabel: "App secret",
    where: "Instagram connects through Facebook Login (an Instagram professional account linked to a Facebook Page), so it uses a Meta app's App ID + App secret, normally the same app as Facebook. Only untick to use a separate Meta app (that app → App settings → Basic). The \"Instagram app ID\" under \"API setup with Instagram login\" does not work for this connection. Paste the redirect URI under Facebook Login → Settings → Valid OAuth Redirect URIs."
  },
  linkedin: {
    label: "LinkedIn",
    idLabel: "Client ID",
    secretLabel: "Primary Client Secret",
    where: "LinkedIn Developers → My apps → your app → Auth: Client ID + Primary Client Secret. Paste the redirect URI under \"Authorized redirect URLs for your app\"."
  },
  x: {
    label: "X",
    idLabel: "OAuth 2.0 Client ID",
    secretLabel: "OAuth 2.0 Client Secret",
    where: "X Developer Portal → Projects & Apps → your app → Keys and tokens: OAuth 2.0 Client ID + Client Secret. Paste the redirect URI as the Callback URI in User authentication settings."
  },
  tiktok: {
    label: "TikTok",
    idLabel: "Client key",
    secretLabel: "Client secret",
    where: "TikTok for Developers → Manage apps → your app: Client key + Client secret. Paste the redirect URI under Login Kit → Redirect URI."
  }
};

/** Instagram account / business IDs look like 1784xxxxxxxxxxxxx (17 digits); Meta rejects them as an App ID. */
export function looksLikeInstagramAccountId(id: string | null | undefined) {
  return /^1784\d{13}$/.test((id ?? "").trim());
}

function keyLine(k: Keys | undefined, idLabel: string) {
  if (!k || k.source === "none") return "not set";
  if (k.source === "env") return `${idLabel} ${k.clientId} · from server environment`;
  return `${idLabel} ${k.clientId}${k.secretSet ? ` · secret …${k.secretLast4}` : ""} · set in Settings`;
}

export function SocialAppKeys({ initialKeys, redirectUris, highlight, highlightFor }: { initialKeys: Keys[]; redirectUris: Record<string, string>; highlight?: string | null; highlightFor?: string | null }) {
  const [keys, setKeys] = useState(initialKeys);
  const [busy, setBusy] = useState<string | null>(null);
  // The panel a Connect/Reconnect error pointed to opens its fields (Instagram on the Facebook keys: Facebook's).
  const [editing, setEditing] = useState<string | null>(() => {
    if (highlight === "instagram" && initialKeys.find((k) => k.platform === "instagram")?.usesFacebook) return "facebook";
    return highlight ?? null;
  });
  const [form, setForm] = useState({ clientId: "", clientSecret: "" });
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const say = (k: string, ok: boolean, text: string) => setStatus((s) => ({ ...s, [k]: { ok, text } }));
  const facebook = keys.find((k) => k.platform === "facebook");

  async function call(method: "POST" | "DELETE", platform: Platform, extra: Record<string, unknown> = {}, done = "Saved. Now press Connect / Reconnect for the brand above.") {
    setBusy(platform);
    try {
      const res = await fetch(method === "DELETE" ? `/api/os/social-app-keys?platform=${platform}` : "/api/os/social-app-keys", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "POST" ? JSON.stringify({ platform, ...form, ...extra }) : undefined
      });
      const body = (await res.json()) as { keys?: Keys[]; error?: string };
      if (!res.ok || !body.keys) throw new Error(body.error ?? "Failed.");
      setKeys(body.keys);
      setEditing(null);
      setForm({ clientId: "", clientSecret: "" });
      say(platform, true, method === "POST" ? done : "Removed.");
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

  function openEditor(k: Keys) {
    setEditing(editing === k.platform ? null : k.platform);
    // Never prefill a secret; the id only when it was set here.
    setForm({ clientId: k.source === "settings" ? k.clientId ?? "" : "", clientSecret: "" });
  }

  function editor(k: Keys) {
    const p = PLATFORMS[k.platform];
    const submit = () => {
      if (busy === null && form.clientId.trim()) void call("POST", k.platform);
    };
    // Not a <form>: a text field + a secret field inside a form is what password managers fill a saved login into.
    return (
      <div role="presentation" className="mt-2 flex flex-wrap items-center gap-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}>
        {(k.platform === "facebook" || k.platform === "instagram") && looksLikeInstagramAccountId(form.clientId) ? (
          <p className="w-full text-xs text-amber-300">This looks like an Instagram account ID (1784…), not a Meta App ID: use the App ID from App settings → Basic.</p>
        ) : null}
        <OSKeyInput name={`${k.platform}_app_client_id`} value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} placeholder={p.idLabel} aria-label={`${p.label} ${p.idLabel}`} className="w-72" />
        <OSKeyInput secret name={`${k.platform}_app_client_secret`} value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} placeholder={k.source === "settings" && k.secretSet ? `${p.secretLabel} (leave empty to keep …${k.secretLast4})` : p.secretLabel} aria-label={`${p.label} ${p.secretLabel}`} className="w-80" />
        <OSButton type="button" className="px-3 py-1.5 text-xs" disabled={busy !== null || !form.clientId.trim()} onClick={submit}>
          {busy === k.platform ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save
        </OSButton>
        <button type="button" className="text-xs text-neutral-400" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    );
  }

  function redirect(platform: Platform) {
    const uri = redirectUris[platform] ?? "";
    const id = `${platform}:redirect`;
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">Redirect URI:</span>
        <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-200">{uri || "not set on the server"}</code>
        {uri ? (
          <button type="button" onClick={() => copy(uri, id)} className="inline-flex items-center gap-1 rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:bg-neutral-900" aria-label={`Copy ${PLATFORMS[platform].label} redirect URI`}>
            {copied === id ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
            {copied === id ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
    );
  }

  function panel(k: Keys) {
    const p = PLATFORMS[k.platform];
    const st = status[k.platform];
    const isInstagram = k.platform === "instagram";
    const onFacebook = isInstagram && k.usesFacebook && editing !== "instagram";
    const line = onFacebook ? `Uses the Facebook keys${facebook && facebook.source !== "none" ? ` (${keyLine(facebook, "App ID")})` : " · Facebook keys not set yet"}` : keyLine(k, p.idLabel);
    const ready = onFacebook ? Boolean(facebook && facebook.source !== "none") : k.source !== "none";
    const removable = k.source === "settings" && !(isInstagram && k.usesFacebookChosen);
    return (
      <div key={k.platform} id={`app-keys-${k.platform}`} className={`scroll-mt-24 rounded-md border p-3 ${highlight === k.platform ? "border-amber-400/70 bg-amber-400/5" : "border-neutral-800 bg-neutral-950/60"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-44 font-medium text-neutral-100">{p.label}</span>
          <OSBadge tone={ready ? "ok" : "off"}>{line}</OSBadge>
          <div className="ml-auto flex gap-2">
            {!onFacebook ? (
              <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEditor(k)}>
                <KeyRound className="h-3.5 w-3.5" /> {k.source === "none" ? "Add keys" : "Change"}
              </OSButton>
            ) : null}
            {removable ? (
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove the ${p.label} keys set in Settings?`)) void call("DELETE", k.platform); }}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </OSButton>
            ) : null}
          </div>
        </div>
        {highlight === k.platform ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {`${highlightFor ?? p.label} can't connect yet: `}
            {onFacebook ? "it uses the Facebook keys, so add the Facebook App ID and App secret above" : `add the ${p.idLabel} and ${p.secretLabel} below`}, then press Connect / Reconnect again.
          </p>
        ) : null}
        {(k.platform === "facebook" || k.platform === "instagram") && !onFacebook && looksLikeInstagramAccountId(k.clientId) ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {k.clientId} looks like an Instagram account ID, not a Meta App ID, so Facebook answers &quot;Invalid App ID&quot;. Press Change and paste the App ID from Meta for Developers → your app → App settings → Basic (with its App secret).
          </p>
        ) : null}
        {isInstagram ? (
          <label className="mt-2 flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={editing === "instagram" ? false : Boolean(k.usesFacebook)}
              disabled={busy !== null}
              onChange={(e) => {
                if (e.target.checked) void call("POST", "instagram", { useFacebook: true }, "Instagram now uses the Facebook keys.");
                else openEditor(k);
              }}
              aria-label="Use the same keys as Facebook"
            />
            Use the same keys as Facebook
          </label>
        ) : null}
        <div className="mt-2 space-y-1">
          {redirect(k.platform)}
          <p className="text-xs text-neutral-500">Where to find the keys: {p.where}</p>
        </div>
        {editing === k.platform ? editor(k) : null}
        {st ? <p className={`mt-1 text-xs ${st.ok ? "text-emerald-300" : "text-amber-300"}`}>{st.text}</p> : null}
      </div>
    );
  }

  const byPlatform = (p: Platform) => keys.find((k) => k.platform === p);
  return (
    <OSPanel className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-50">App keys</h2>
      <p className="mt-1 text-sm text-neutral-400">The developer-app keys each platform gives you. Secrets are stored encrypted; only the last 4 characters are shown. Copy each redirect URI into that platform&apos;s developer portal.</p>
      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-neutral-800 p-3">
          <div className="mb-2 text-sm font-medium text-neutral-300">Meta: Facebook and Instagram</div>
          <div className="space-y-3">
            {(["facebook", "instagram"] as const).map((p) => byPlatform(p)).filter((k): k is Keys => Boolean(k)).map(panel)}
          </div>
        </div>
        {(["linkedin", "x", "tiktok"] as const).map((p) => byPlatform(p)).filter((k): k is Keys => Boolean(k)).map(panel)}
      </div>
    </OSPanel>
  );
}
