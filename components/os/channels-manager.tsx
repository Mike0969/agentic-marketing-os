"use client";

import { useState } from "react";
import { KeyRound, Loader2, Send, Trash2 } from "lucide-react";
import { OSBadge, OSButton, OSKeyInput, OSPanel } from "@/components/os/ui";

type Channel = {
  id: string; kind: "telegram" | "slack"; name: string; token_last4: string; channel_id: string; enabled: boolean;
  last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null;
};

const ROWS = [
  { kind: "telegram" as const, label: "Telegram", tokenLabel: "Bot token", channelLabel: "Chat id", channelHint: "123456789" },
  { kind: "slack" as const, label: "Slack", tokenLabel: "Bot token (xoxb-…)", channelLabel: "Channel id", channelHint: "C0123456789" }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) throw new Error(body.error ?? body.detail ?? `HTTP ${res.status}`);
  return body;
}

export function ChannelsManager({ initialChannels, env }: { initialChannels: Channel[]; env: { telegram: boolean; slack: boolean } }) {
  const [channels, setChannels] = useState(initialChannels);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ token: "", channelId: "" });
  const refresh = async () => setChannels((await api<{ channels: Channel[] }>("/api/os/notification-channels")).channels);
  const say = (k: string, ok: boolean, text: string) => setStatus((s) => ({ ...s, [k]: { ok, text } }));
  const run = async (k: string, fn: () => Promise<void>) => {
    setBusy(k);
    try {
      await fn();
    } catch (error) {
      say(k, false, error instanceof Error ? error.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <OSPanel className="mb-6">
      <h2 className="text-lg font-semibold text-neutral-50">Notifications</h2>
      <p className="mt-1 text-sm text-neutral-400">Where Crina pings you (ready-to-post, alerts). Tokens are stored encrypted; only the last 4 characters are shown.</p>
      <div className="mt-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
        {ROWS.map((row) => {
          const ui = channels.filter((c) => c.kind === row.kind).sort((a, b) => Number(b.enabled) - Number(a.enabled))[0];
          const fromEnv = env[row.kind];
          const isSet = Boolean(ui) || fromEnv;
          const line = ui ? `…${ui.token_last4} · ${row.channelLabel.toLowerCase()} ${ui.channel_id} · set in Settings` : fromEnv ? "from server environment" : "not set";
          const st = status[row.kind];
          return (
            <div key={row.kind} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-36 font-medium text-neutral-100">{row.label}</span>
                <OSBadge tone={isSet ? "ok" : "off"}>{line}</OSBadge>
                <div className="ml-auto flex flex-wrap gap-2">
                  <OSButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditing(editing === row.kind ? null : row.kind); setForm({ token: "", channelId: ui?.channel_id ?? "" }); }}>
                    <KeyRound className="h-3.5 w-3.5" /> {isSet ? "Change token" : "Add token"}
                  </OSButton>
                  {isSet ? (
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(row.kind, async () => {
                      const r = await api<{ ok: boolean; detail: string }>("/api/os/notification-channels/test", { method: "POST", body: JSON.stringify({ kind: row.kind }) });
                      say(row.kind, r.ok, r.detail);
                    })}>
                      {busy === row.kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test message
                    </OSButton>
                  ) : null}
                  {ui ? (
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => {
                      if (!window.confirm(fromEnv ? `Remove the ${row.label} token set in Settings and use the server one?` : `Remove the ${row.label} token?`)) return;
                      void run(row.kind, async () => { await api(`/api/os/notification-channels/${ui.id}`, { method: "DELETE" }); await refresh(); say(row.kind, true, fromEnv ? "Back to the server token." : "Removed."); });
                    }}>
                      <Trash2 className="h-3.5 w-3.5" /> {fromEnv ? "Use server token" : "Remove"}
                    </OSButton>
                  ) : null}
                </div>
              </div>
              {editing === row.kind ? (
                <div role="presentation" className="mt-2 flex flex-wrap items-center gap-2">
                  <OSKeyInput secret name={`${row.kind}_notify_token`} value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={row.tokenLabel} aria-label={`${row.label} token`} className="w-80" />
                  <OSKeyInput name={`${row.kind}_notify_target`} value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} placeholder={`${row.channelLabel} (${row.channelHint})`} aria-label={`${row.label} ${row.channelLabel}`} className="w-56" />
                  <OSButton type="button" className="px-3 py-1.5 text-xs" disabled={busy !== null || form.token.trim().length < 10 || !form.channelId.trim()} onClick={() => void run(row.kind, async () => {
                    if (ui) await api(`/api/os/notification-channels/${ui.id}`, { method: "PATCH", body: JSON.stringify({ token: form.token, channelId: form.channelId, enabled: true }) });
                    else await api("/api/os/notification-channels", { method: "POST", body: JSON.stringify({ kind: row.kind, name: row.label, token: form.token, channelId: form.channelId }) });
                    setEditing(null);
                    await refresh();
                    say(row.kind, true, 'Saved. Press "Send test message".');
                  })}>Save</OSButton>
                  <button type="button" className="text-xs text-neutral-400" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              ) : null}
              {st ? <p className={`mt-1 text-xs ${st.ok ? "text-emerald-300" : "text-amber-300"}`}>{st.text}</p> : null}
            </div>
          );
        })}
      </div>
    </OSPanel>
  );
}
