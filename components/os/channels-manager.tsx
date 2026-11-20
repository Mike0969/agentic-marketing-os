"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect } from "@/components/os/ui";

type Channel = {
  id: string; kind: "telegram" | "slack"; name: string; token_last4: string; channel_id: string; enabled: boolean;
  last_test_ok: boolean | null; last_test_at: string | null; last_test_detail: string | null;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
  if (!res.ok) throw new Error(body.error ?? body.detail ?? `HTTP ${res.status}`);
  return body;
}

export function ChannelsManager({ initialChannels, env }: { initialChannels: Channel[]; env: { telegram: boolean; slack: boolean } }) {
  const [channels, setChannels] = useState(initialChannels);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "telegram", name: "", token: "", channelId: "" });
  const [replacing, setReplacing] = useState<Record<string, string>>({});
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
          <h2 className="text-lg font-semibold text-neutral-50">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-400">Where Crina pings you (ready-to-post, alerts). Tokens are stored encrypted; only the last 4 characters are shown.</p>
        </div>
        <OSButton onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" /> Add channel
        </OSButton>
      </div>
      {message ? <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>{message.text}</p> : null}

      {adding ? (
        <form
          className="mt-4 grid gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run("add", async () => {
              const { channel } = await api<{ channel: Channel }>("/api/os/notification-channels", { method: "POST", body: JSON.stringify(form) });
              setChannels((cur) => [...cur, channel]);
              setForm({ kind: "telegram", name: "", token: "", channelId: "" });
              setAdding(false);
              setMessage({ tone: "ok", text: `${channel.name} added. Press "Send test message".` });
            });
          }}
        >
          <OSField label="Type">
            <OSSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Channel type">
              <option value="telegram">Telegram</option>
              <option value="slack">Slack</option>
            </OSSelect>
          </OSField>
          <OSField label="Name (optional)">
            <OSInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mihai's Telegram" />
          </OSField>
          <OSField label={form.kind === "telegram" ? "Bot token" : "Bot token (xoxb-…)"}>
            <OSInput type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} aria-label="Bot token" />
          </OSField>
          <OSField label={form.kind === "telegram" ? "Chat id" : "Channel id"}>
            <OSInput value={form.channelId} onChange={(e) => setForm({ ...form, channelId: e.target.value })} placeholder={form.kind === "telegram" ? "123456789" : "C0123456789"} />
          </OSField>
          <div>
            <OSButton type="submit" disabled={busy === "add" || form.token.trim().length < 10 || !form.channelId.trim()}>
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save
            </OSButton>
          </div>
        </form>
      ) : null}

      <div className="mt-4 space-y-2">
        {channels.map((c) => (
          <div key={c.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-100">{c.name}</span>
              <OSBadge tone="off">{c.kind === "telegram" ? "Telegram" : "Slack"}</OSBadge>
              <OSBadge tone={c.enabled ? "ok" : "off"}>{c.enabled ? "enabled" : "disabled"}</OSBadge>
              <span className="text-xs text-neutral-500">token …{c.token_last4} · {c.kind === "telegram" ? "chat" : "channel"} {c.channel_id}</span>
              {c.last_test_at ? <span className={`text-xs ${c.last_test_ok ? "text-emerald-300" : "text-amber-300"}`}>{c.last_test_detail}</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(`test:${c.id}`, async () => {
                const r = await api<{ ok: boolean; detail: string }>(`/api/os/notification-channels/${c.id}/test`, { method: "POST", body: JSON.stringify({ kind: c.kind }) });
                setChannels((cur) => cur.map((x) => (x.id === c.id ? { ...x, last_test_ok: r.ok, last_test_at: new Date().toISOString(), last_test_detail: r.detail } : x)));
                setMessage({ tone: r.ok ? "ok" : "warn", text: `${c.name}: ${r.detail}` });
              })}>
                {busy === `test:${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send test message
              </OSButton>
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => void run(`toggle:${c.id}`, async () => {
                const { channel } = await api<{ channel: Channel }>(`/api/os/notification-channels/${c.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !c.enabled }) });
                setChannels((cur) => cur.map((x) => (x.id === c.id ? channel : x)));
              })}>
                {c.enabled ? "Disable" : "Enable"}
              </OSButton>
              <OSInput type="password" autoComplete="off" className="w-48 px-2 py-1 text-xs" placeholder="New token to replace" value={replacing[c.id] ?? ""} onChange={(e) => setReplacing({ ...replacing, [c.id]: e.target.value })} aria-label={`Replace token for ${c.name}`} />
              <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null || (replacing[c.id] ?? "").trim().length < 10} onClick={() => void run(`tok:${c.id}`, async () => {
                const { channel } = await api<{ channel: Channel }>(`/api/os/notification-channels/${c.id}`, { method: "PATCH", body: JSON.stringify({ token: replacing[c.id] }) });
                setChannels((cur) => cur.map((x) => (x.id === c.id ? channel : x)));
                setReplacing({ ...replacing, [c.id]: "" });
              })}>
                <KeyRound className="h-3.5 w-3.5" /> Replace token
              </OSButton>
              <OSButton variant="danger" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={() => {
                if (!window.confirm(`Remove ${c.name}?`)) return;
                void run(`del:${c.id}`, async () => {
                  await api(`/api/os/notification-channels/${c.id}`, { method: "DELETE" });
                  setChannels((cur) => cur.filter((x) => x.id !== c.id));
                });
              }}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </OSButton>
            </div>
          </div>
        ))}
        {(["telegram", "slack"] as const).map((k) =>
          env[k] ? (
            <div key={k} className="flex flex-wrap items-center gap-2 rounded-md border border-neutral-800/70 bg-neutral-950/30 p-3 text-sm text-neutral-300">
              {k === "telegram" ? "Telegram" : "Slack"} <OSBadge tone="off">from server environment</OSBadge>
              {channels.some((c) => c.kind === k && c.enabled) ? <span className="text-xs text-amber-300">overridden by a channel added above</span> : null}
            </div>
          ) : null
        )}
        {!channels.length && !env.telegram && !env.slack ? <p className="text-sm text-neutral-500">No notification channel yet. Add Telegram or Slack.</p> : null}
      </div>
    </OSPanel>
  );
}
