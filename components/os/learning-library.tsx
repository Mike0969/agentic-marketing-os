"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, FileText, ImageIcon, Lightbulb, Link2, Loader2, Mic, Plus, Trash2, UploadCloud, Youtube } from "lucide-react";
import { OSBadge, OSButton, OSField, OSInput, OSPanel, OSSelect, OSTextarea } from "@/components/os/ui";

type Item = {
  id: string; brand_id: string | null; item_type: "image" | "idea" | "podcast" | "youtube" | "document" | "link"; title: string; tags: string[];
  url: string | null; file_path: string | null; notes: string; used_by_agents: boolean; created_at: string;
};
type Brand = { id: string; name: string };

const ICON = { idea: Lightbulb, youtube: Youtube, podcast: Mic, image: ImageIcon, document: FileText, link: Link2 } as const;
const LABEL = { idea: "Idea", youtube: "YouTube", podcast: "Podcast", image: "Image", document: "Document", link: "Web link" } as const;

type RunUse = { runId: string; part: string; usedAt: string; campaignId: string | null; campaignTitle: string | null; items: Array<{ id: string; title: string }> };
const PAGE = 60;

export function LearningLibrary({ initialItems, brands, inboxPath, runUses = [] }: { initialItems: Item[]; brands: Brand[]; inboxPath?: string; runUses?: RunUse[] }) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [brandId, setBrandId] = useState("");
  const [dragging, setDragging] = useState(false);
  const [entry, setEntry] = useState({ mode: "idea" as "idea" | "link", title: "", url: "", notes: "", tags: "" });
  const [filter, setFilter] = useState("all");
  const fileInput = useRef<HTMLInputElement>(null);
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const [search, setSearch] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const matching = items.filter((i) => (filter === "all" || i.item_type === filter) && words.every((w) => `${i.title} ${i.tags.join(" ")}`.toLowerCase().includes(w)));
  const shown = matching.slice(0, pageCount * PAGE);

  async function post(data: FormData) {
    const res = await fetch("/api/marketing/learning", { method: "POST", body: data });
    const body = (await res.json()) as { item?: Item; error?: string };
    if (!res.ok || !body.item) throw new Error(body.error ?? "Could not add.");
    return body.item;
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy("upload");
    setMessage(null);
    const added: Item[] = [];
    const failed: string[] = [];
    for (const file of list) {
      const data = new FormData();
      data.append("file", file);
      data.append("brandId", brandId);
      try {
        added.push(await post(data));
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
    setItems((cur) => [...added, ...cur]);
    setMessage({ tone: failed.length ? "warn" : "ok", text: `${added.length} file(s) added${failed.length ? `; not added: ${failed.join("; ")}` : ""}.` });
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    setBusy("entry");
    setMessage(null);
    try {
      const data = new FormData();
      if (entry.mode === "idea") data.append("type", "idea");
      data.append("title", entry.title);
      data.append("url", entry.mode === "link" ? entry.url : "");
      data.append("notes", entry.notes);
      data.append("tags", entry.tags);
      data.append("brandId", brandId);
      const item = await post(data);
      setItems((cur) => [item, ...cur]);
      setEntry({ ...entry, title: "", url: "", notes: "", tags: "" });
      setMessage({ tone: "ok", text: `"${item.title}" added as ${LABEL[item.item_type]}.` });
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

  async function importInbox() {
    setBusy("inbox");
    setMessage(null);
    try {
      const res = await fetch("/api/marketing/learning/import-inbox", { method: "POST" });
      const body = (await res.json()) as { added?: number; skipped?: string[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Import failed.");
      const list = await (await fetch("/api/marketing/learning")).json() as { items: Item[] };
      setItems(list.items);
      setMessage({ tone: body.skipped?.length ? "warn" : "ok", text: `${body.added ?? 0} item(s) imported from the inbox${body.skipped?.length ? `; skipped: ${body.skipped.join("; ")}` : ""}.` });
    } catch (error) {
      setMessage({ tone: "warn", text: error instanceof Error ? error.message : "Import failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <OSPanel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-300">
            Saved on the NexRide server · used by Crina and the agents when &quot;used by agents&quot; is on.
          </p>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            For brand
            <OSSelect value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Brand" className="w-56">
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </OSSelect>
          </label>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}
          className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-cyan-400 bg-cyan-400/10" : "border-neutral-700 bg-neutral-950/50"}`}
        >
          {busy === "upload" ? <Loader2 className="h-8 w-8 animate-spin text-cyan-300" /> : <UploadCloud className="h-8 w-8 text-cyan-300" />}
          <p className="text-base font-medium text-neutral-100">Drop files here or <button type="button" onClick={() => fileInput.current?.click()} className="text-cyan-300 underline">Browse</button></p>
          <p className="text-sm text-neutral-500">Images, PDFs, Word, text and markdown files · up to 20 MB each · the type is detected for you</p>
          <input ref={fileInput} type="file" multiple className="hidden" aria-label="Upload files" onChange={(e) => e.target.files && void uploadFiles(e.target.files)} accept="image/*,.pdf,.doc,.docx,.txt,.md,.pptx,.xlsx,.csv" />
        </div>
        {inboxPath ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-400">
            <span>Or put many files in the server inbox <code className="text-neutral-300">{inboxPath}</code>, then</span>
            <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy !== null} onClick={importInbox}>
              {busy === "inbox" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Import from inbox
            </OSButton>
          </div>
        ) : null}
        {message ? <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>{message.text}</p> : null}
      </OSPanel>

      <OSPanel>
        <h2 className="text-lg font-semibold text-neutral-50">Add an idea or a link</h2>
        <form onSubmit={addEntry} className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="flex gap-2 md:col-span-2">
            {(["idea", "link"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setEntry({ ...entry, mode: m })} aria-pressed={entry.mode === m} className={`rounded-md border px-3 py-1.5 text-sm ${entry.mode === m ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100" : "border-neutral-800 text-neutral-300"}`}>
                {m === "idea" ? "Idea (text)" : "Link: YouTube, podcast or web page"}
              </button>
            ))}
          </div>
          <OSField label="Title">
            <OSInput value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} aria-label="Title" placeholder={entry.mode === "idea" ? "e.g. Show the driver's whole fare" : "e.g. Founder talk on zero commission"} />
          </OSField>
          {entry.mode === "link" ? (
            <OSField label="Link">
              <OSInput value={entry.url} onChange={(e) => setEntry({ ...entry, url: e.target.value })} aria-label="Link" placeholder="https://www.youtube.com/watch?v=…" />
            </OSField>
          ) : (
            <OSField label="Tags (comma separated)">
              <OSInput value={entry.tags} onChange={(e) => setEntry({ ...entry, tags: e.target.value })} aria-label="Tags" placeholder="drivers, pricing" />
            </OSField>
          )}
          <div className="md:col-span-2">
            <OSField label={entry.mode === "idea" ? "The idea" : "Transcript or notes (optional; videos are not downloaded)"}>
              <OSTextarea rows={3} value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} aria-label="Notes" />
            </OSField>
          </div>
          <div>
            <OSButton type="submit" disabled={busy !== null || !entry.title.trim() || (entry.mode === "link" ? !entry.url.trim() : !entry.notes.trim())}>
              {busy === "entry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to library
            </OSButton>
          </div>
        </form>
      </OSPanel>

      <OSPanel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-50">Library ({items.length})</h2>
          <div className="flex flex-wrap gap-2">
          <OSInput value={search} onChange={(e) => { setSearch(e.target.value); setPageCount(1); }} placeholder="Search titles and tags" aria-label="Search the library" className="w-64" />
          <OSSelect value={filter} onChange={(e) => { setFilter(e.target.value); setPageCount(1); }} aria-label="Filter by type" className="w-48">
            <option value="all">All types</option>
            {Object.entries(LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </OSSelect>
          </div>
        </div>
        {search || filter !== "all" ? <p className="mt-2 text-xs text-neutral-500">{matching.length} matching</p> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {shown.length ? (
            shown.map((item) => {
              const Icon = ICON[item.item_type] ?? FileText;
              return (
                <div key={item.id} className="flex gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
                    {item.item_type === "image" && item.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <Icon className="h-8 w-8 text-cyan-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-neutral-100">{item.title}</span>
                      <OSBadge tone="off">{LABEL[item.item_type]}</OSBadge>
                      <OSBadge tone="off">{item.brand_id ? brandName.get(item.brand_id) ?? "brand" : "all brands"}</OSBadge>
                      <OSBadge tone={item.used_by_agents ? "ok" : "off"}>{item.used_by_agents ? "used by agents" : "not used"}</OSBadge>
                    </div>
                    {item.tags.length ? <div className="mt-1 text-xs text-neutral-500">{item.tags.join(" · ")}</div> : null}
                    {item.notes ? <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{item.notes}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-xs text-cyan-200 hover:bg-neutral-900">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                      ) : null}
                      <OSButton variant="secondary" className="px-2 py-1 text-xs" disabled={busy === item.id} onClick={() => patch(item, { usedByAgents: !item.used_by_agents })}>
                        {item.used_by_agents ? "Stop using" : "Use for agents"}
                      </OSButton>
                      <OSButton variant="danger" className="px-2 py-1 text-xs" disabled={busy === item.id} onClick={() => remove(item)}>
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </OSButton>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-500">{items.length ? "Nothing matches." : "Nothing here yet. Drop a file above, or add an idea or a link."}</p>
          )}
        </div>
        {matching.length > shown.length ? (
          <div className="mt-4 text-center">
            <OSButton variant="secondary" onClick={() => setPageCount((n) => n + 1)}>Show more ({matching.length - shown.length} left)</OSButton>
          </div>
        ) : null}
      </OSPanel>

      <OSPanel>
        <h2 className="text-lg font-semibold text-neutral-50">What the last runs read</h2>
        <p className="mt-1 text-sm text-neutral-400">Each plan or run gets only the {10} items most relevant to its campaign (brand, keywords in the title and tags, newest), each cut to 1,500 characters, never the whole library.</p>
        {runUses.length ? (
          <ul className="mt-3 space-y-2">
            {runUses.map((r) => (
              <li key={r.runId} className="rounded-md border border-neutral-800 p-2 text-sm">
                <div className="text-neutral-200">
                  {r.part === "plan" ? "Plan" : "Run"} · {r.campaignTitle ?? "campaign"} · <span className="text-neutral-500">{new Date(r.usedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <div className="mt-1 text-xs text-neutral-400">{r.items.map((i, n) => `${n + 1}. ${i.title}`).join(" · ")}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">No run has read the library yet; the next plan or run will show here.</p>
        )}
      </OSPanel>
    </div>
  );
}
