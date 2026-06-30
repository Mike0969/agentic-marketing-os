"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Loader2, Trash2, X } from "lucide-react";
import { OSBadge, OSButton, OSPanel } from "@/components/os/ui";
import type { Brand, ContentItem } from "@/lib/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function platformClasses(platform: string) {
  const k = (platform || "").toLowerCase();
  if (k.includes("linkedin")) return "border-sky-500/40 bg-sky-500/15 text-sky-200";
  if (k.includes("instagram")) return "border-pink-500/40 bg-pink-500/15 text-pink-200";
  if (k.includes("facebook")) return "border-blue-500/40 bg-blue-500/15 text-blue-200";
  if (k.includes("tiktok")) return "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200";
  if (k === "x" || k.includes("twitter")) return "border-neutral-400/40 bg-neutral-400/15 text-neutral-100";
  if (k.includes("blog")) return "border-amber-500/40 bg-amber-500/15 text-amber-200";
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day);
  return date;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

// Format a Date for an <input type="datetime-local"> value (local time, no seconds).
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleCalendar({ items, brands }: { items: ContentItem[]; brands: Brand[] }) {
  const brandName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const [list, setList] = useState(items);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)), [weekStart]);
  const scheduled = useMemo(() => list.filter((i) => i.scheduled_at), [list]);
  const unscheduled = useMemo(() => list.filter((i) => !i.scheduled_at), [list]);

  function openItem(item: ContentItem) {
    setSelected(item);
    setMessage(null);
    setWhen(item.scheduled_at ? toLocalInput(new Date(item.scheduled_at)) : toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)));
  }

  async function save(action: "set" | "remove") {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/marketing/content-items/${selected.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "remove" ? { action: "remove" } : { action: "set", scheduled_at: new Date(when).toISOString() })
      });
      const payload = (await res.json()) as { contentItem?: ContentItem; error?: string };
      if (!res.ok || !payload.contentItem) throw new Error(payload.error ?? "Failed.");
      setList((cur) => cur.map((x) => (x.id === selected.id ? payload.contentItem! : x)));
      setSelected(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const rangeLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <OSButton variant="secondary" onClick={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))}><ChevronLeft className="h-4 w-4" /></OSButton>
          <OSButton variant="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</OSButton>
          <OSButton variant="secondary" onClick={() => setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))}><ChevronRight className="h-4 w-4" /></OSButton>
          <span className="ml-1 text-sm font-medium text-neutral-300">{rangeLabel}</span>
        </div>
        <span className="text-xs text-neutral-500">Posting runs from this schedule. Click a post to reschedule or remove.</span>
      </div>

      {unscheduled.length ? (
        <OSPanel className="border-amber-500/20 bg-amber-500/5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-300">Approved, not scheduled — click to set a time ({unscheduled.length})</div>
          <div className="flex flex-wrap gap-2">
            {unscheduled.map((item) => (
              <button key={item.id} type="button" onClick={() => openItem(item)} className={`rounded-md border px-2.5 py-1 text-xs ${platformClasses(item.platform)}`}>
                {item.platform} · {item.title.slice(0, 32)}
              </button>
            ))}
          </div>
        </OSPanel>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const dayItems = scheduled
            .filter((i) => sameDay(new Date(i.scheduled_at as string), day))
            .sort((a, b) => Date.parse(a.scheduled_at as string) - Date.parse(b.scheduled_at as string));
          const isToday = sameDay(day, today);
          return (
            <OSPanel key={day.toISOString()} className={`min-h-44 p-2 ${isToday ? "border-cyan-500/40" : ""}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200">{DAY_LABELS[(day.getDay() + 6) % 7]}</span>
                <span className={`text-xs ${isToday ? "text-cyan-300" : "text-neutral-500"}`}>{day.getDate()}</span>
              </div>
              <div className="space-y-1.5">
                {dayItems.map((item) => (
                  <button key={item.id} type="button" onClick={() => openItem(item)} className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${platformClasses(item.platform)}`}>
                    <div className="flex items-center gap-1 font-medium"><Clock className="h-3 w-3" />{timeLabel(item.scheduled_at as string)}</div>
                    <div className="mt-0.5 line-clamp-2 opacity-90">{item.title}</div>
                  </button>
                ))}
                {!dayItems.length ? <div className="rounded border border-dashed border-neutral-800 px-2 py-3 text-center text-[11px] text-neutral-600">—</div> : null}
              </div>
            </OSPanel>
          );
        })}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <OSBadge tone="info">{selected.platform}</OSBadge>
                <span className="text-xs text-neutral-500">{brandName.get(selected.brand_id) ?? ""}</span>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-neutral-500 hover:text-neutral-200"><X className="h-5 w-5" /></button>
            </div>
            <h3 className="text-base font-semibold text-neutral-50">{selected.title}</h3>
            {selected.visual_asset_url ? <img src={selected.visual_asset_url} alt={selected.title} className="mt-3 w-full rounded-md border border-neutral-800 object-cover" /> : null}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{selected.body}</p>
            {selected.CTA ? <p className="mt-2 text-sm text-cyan-300">CTA: {selected.CTA}</p> : null}

            <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900/60 p-3">
              <label className="text-xs font-medium uppercase tracking-wider text-neutral-500">When to post</label>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100" />
            </div>

            {message ? <p className="mt-2 text-sm text-rose-300">{message}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <OSButton onClick={() => save("set")} disabled={busy || !when}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}{selected.scheduled_at ? "Reschedule" : "Schedule"}</OSButton>
              <OSButton variant="danger" onClick={() => save("remove")} disabled={busy}><Trash2 className="h-4 w-4" />Remove from schedule</OSButton>
              <OSButton variant="secondary" onClick={() => setSelected(null)}>Close</OSButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
