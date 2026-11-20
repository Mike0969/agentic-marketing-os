"use client";

import { useMemo, useState } from "react";
import { FileText, ImageIcon, Lightbulb, Link2, Loader2, Mic, Plus, Trash2, Youtube } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";

type Item = {
  id: string; brand_id: string | null; item_type: "image" | "idea" | "podcast" | "youtube" | "document" | "link"; title: string; tags: string[];
  url: string | null; notes: string; used_by_agents: boolean; created_at: string;
};
type Brand = { id: string; name: string };

const TYPES = [
  { key: "idea", label: "Idea (text)", icon: Lightbulb },
  { key: "youtube", label: "YouTube link", icon: Youtube },
  { key: "podcast", label: "Podcast link", icon: Mic },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "document", label: "Document", icon: FileText },
  { key: "link", label: "Web link", icon: Link2 }
] as const;

export function LearningLibrary({ initialItems, brands }: { initialItems: Item[]; brands: Brand[] }) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [form, setForm] = useState({ type: "idea", title: "", brandId: "", tags: "", url: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState("all");
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const shown = items.filter((i) => filter === "all" || i.item_type === filter);
  const needsUrl = form.type === "youtube" || form.type === "podcast" || form.type === "link";
  const canFile = form.type === "image" || form.type === "document";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setMessage(null);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([k, v]) => data.append(k, v));
      if (file) data.append("file", file);
      const res = await fetch("/api/marketing/learning", { method: "POST", body: data });
      const body = (await res.json()) as { item?: Item; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error ?? "Could not add.");
      setItems((cur) => [body.item!, ...cur]);
      setForm({ ...form, title: "", tags: "", url: "", notes: "" });
      setFile(null);
      setMessage({ tone: "ok", text: `"${body.item.title}" added. The agents read it from the next run.` });
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Could not add." });
    } finally {
      setBusy(null);
    }
  }

  async function patch(item: Item, change: Record<string, unknown>) {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/marketing/learning/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const body = (await res.json()) as { item?: Item; error?: string };
      if (!res.ok || !body.item) throw new Error(body.error ?? "Could not update.");
      setItems((cur) => cur.map((x) => (x.id === item.id ? body.item! : x)));
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Could not update." });
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Remove "${item.title}"?`)) return;
    setBusy(item.id);
    try {
      const res = await fetch(`/api/marketing/learning/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not remove.");
      setItems((cur) => cur.filter((x) => x.id !== item.id));
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Could not remove." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <OSPanel>
        <h2 className="text-lg font-semibold text-neutral-50">Add material</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Ideas, YouTube or podcast links, images, documents and web links for Crina and the agents. They read the items marked &quot;used by agents&quot; before every plan, post and visual, next to your Yes/Rework notes. Links are kept as links: video and audio are not downloaded; paste a transcript or notes if you want the agents to use what is said.
        </p>
        {message ? <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>{message.text}</p> : null}
        <form onSubmit={add} className="mt-4 grid gap-3 md:grid-cols-2">
          <OSField label="Type">
            <OSSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} aria-label="Type">
              {TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </OSSelect>
          </OSField>
          <OSField label="Title">
            <OSInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Founder talk on zero commission" aria-label="Title" />
          </OSField>
          <OSField label="For brand">
            <OSSelect value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })} aria-label="Brand">
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </OSSelect>
          </OSField>
          <OSField label="Tags (comma separated)">
            <OSInput value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="drivers, pricing, dubai" aria-label="Tags" />
          </OSField>
          {needsUrl || form.type === "image" || form.type === "document" ? (
            <OSField label={needsUrl ? "Link" : "Link (or upload a file)"}>
              <OSInput value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" aria-label="Link" />
            </OSField>
          ) : null}
          {canFile ? (
            <OSField label="File (max 20 MB)">
              <input type="file" accept={form.type === "image" ? "image/*" : undefined} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-neutral-300" aria-label="File" />
            </OSField>
          ) : null}
          <div className="md:col-span-2">
            <OSField label={form.type === "idea" ? "The idea" : form.type === "youtube" || form.type === "podcast" ? "Transcript or notes (optional)" : "Notes (optional)"}>
              <OSTextarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} aria-label="Notes" />
            </OSField>
          </div>
          <div>
            <OSButton type="submit" disabled={busy === "add" || !form.title.trim()}>
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to library
            </OSButton>
          </div>
        </form>
      </OSPanel>

      <OSPanel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-50">Library ({items.length})</h2>
          <OSSelect value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by type" className="w-48">
            <option value="all">All types</option>
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </OSSelect>
        </div>
        <div className="mt-4 space-y-2">
          {shown.length ? (
            shown.map((item) => {
              const Icon = TYPES.find((t) => t.key === item.item_type)?.icon ?? FileText;
              return (
                <div key={item.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <span className="font-medium text-neutral-100">{item.title}</span>
                    <OSBadge tone="off">{item.brand_id ? brandName.get(item.brand_id) ?? "brand" : "all brands"}</OSBadge>
                    {item.tags.map((t) => (
                      <OSBadge key={t} tone="info">{t}</OSBadge>
                    ))}
                    <OSBadge tone={item.used_by_agents ? "ok" : "off"}>{item.used_by_agents ? "used by agents" : "not used"}</OSBadge>
                  </div>
                  {item.item_type === "image" && item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.title} className="mt-2 max-h-40 rounded-md" />
                  ) : null}
                  {item.url && item.item_type !== "image" ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-sm text-cyan-300 underline">{item.url}</a>
                  ) : null}
                  {item.notes ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-neutral-400">{item.notes}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy === item.id} onClick={() => patch(item, { usedByAgents: !item.used_by_agents })}>
                      {item.used_by_agents ? "Stop using" : "Use for agents"}
                    </OSButton>
                    <OSButton variant="danger" className="px-2 py-1 text-xs" disabled={busy === item.id} onClick={() => remove(item)}>
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </OSButton>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-500">Nothing here yet. Add an idea, a YouTube or podcast link, an image or a document above.</p>
          )}
        </div>
      </OSPanel>
    </div>
  );
}
