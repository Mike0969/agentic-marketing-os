import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Learning library (table learning_items, migration 0040): reference materials Mihai adds for the
 * agents: images, ideas (text), podcast / YouTube links (link + optional transcript; media is never
 * downloaded), documents and web links. Items with used_by_agents=true go into every maker's, Crina's
 * judge's and Jev's prompt as "Reference materials from Mihai", next to the Yes/Rework notes.
 */

export const ITEM_TYPES = ["image", "idea", "podcast", "youtube", "document", "link"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];
export const isItemType = (v: unknown): v is ItemType => typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);

export type LearningItem = {
  id: string; brand_id: string | null; item_type: ItemType; title: string; tags: string[]; url: string | null; file_path: string | null;
  notes: string; used_by_agents: boolean; created_at: string; updated_at: string;
};

const BUCKET = "marketing-assets";
const MAX_FILE = 20 * 1024 * 1024;

function db() {
  const supabase = createServiceClient();
  if (!supabase) throw new Error("Supabase service client is not configured.");
  return supabase;
}

const isHttp = (v: string) => /^https?:\/\/[^\s]+$/.test(v);

export function parseTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.map(String) : typeof value === "string" ? value.split(/[,;]/) : [];
  return Array.from(new Set(raw.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12);
}

export async function listLearningItems(): Promise<LearningItem[]> {
  const { data, error } = await db().from("learning_items").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LearningItem[];
}

/** Type from a dropped file: images by MIME, everything else is a document. */
export function typeForFile(file: { type: string; name: string }): ItemType {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file.name) ? "image" : "document";
}

/** Type from a pasted link: YouTube, common podcast hosts, else a web link. */
export function typeForUrl(url: string): ItemType {
  if (/(youtube\.com|youtu\.be)\//i.test(url)) return "youtube";
  if (/(podcasts\.apple\.com|open\.spotify\.com\/(episode|show)|anchor\.fm|podbean|buzzsprout|soundcloud\.com)/i.test(url)) return "podcast";
  return "link";
}

const titleFromFile = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 200) || "Untitled file";

export async function addLearningItem(input: { type: unknown; title: unknown; brandId?: unknown; tags?: unknown; url?: unknown; notes?: unknown; file?: File | null }): Promise<LearningItem> {
  // Auto-detect: a dropped file needs no type or title; a pasted link picks YouTube / podcast / link.
  if (!isItemType(input.type) && input.file && input.file.size > 0) input = { ...input, type: typeForFile(input.file) };
  if (!isItemType(input.type) && typeof input.url === "string" && input.url.trim()) input = { ...input, type: typeForUrl(input.url.trim()) };
  if ((typeof input.title !== "string" || !input.title.trim()) && input.file && input.file.size > 0) input = { ...input, title: titleFromFile(input.file.name) };
  if (!isItemType(input.type)) throw new Error("Choose a type: image, idea, podcast, YouTube, document or link.");
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  if (!title) throw new Error("Give it a title.");
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 20000) : "";
  const url = typeof input.url === "string" && input.url.trim() ? input.url.trim() : null;
  if (url && !isHttp(url)) throw new Error("The link must start with https://");
  if ((input.type === "podcast" || input.type === "youtube" || input.type === "link") && !url) throw new Error("Paste the link.");
  if (input.type === "youtube" && url && !/(youtube\.com|youtu\.be)\//i.test(url)) throw new Error("That does not look like a YouTube link.");
  if (input.type === "idea" && !notes) throw new Error("Write the idea.");
  const brandId = typeof input.brandId === "string" && /^[0-9a-f-]{36}$/i.test(input.brandId) ? input.brandId : null;
  const id = randomUUID();
  let filePath: string | null = null;
  let fileUrl: string | null = url;
  if (input.file && input.file.size > 0) {
    if (input.type !== "image" && input.type !== "document") throw new Error("Files can be added as an image or a document.");
    if (input.file.size > MAX_FILE) throw new Error("The file is larger than 20 MB.");
    if (input.type === "image" && !input.file.type.startsWith("image/")) throw new Error("That file is not an image.");
    const safe = input.file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
    filePath = `learning/${id}/${safe}`;
    const { error: upErr } = await db().storage.from(BUCKET).upload(filePath, Buffer.from(await input.file.arrayBuffer()), { contentType: input.file.type || "application/octet-stream", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    fileUrl = db().storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
  } else if (input.type === "image" && !url) {
    throw new Error("Add an image file or an image link.");
  }
  const { data, error } = await db()
    .from("learning_items")
    .insert({ id, brand_id: brandId, item_type: input.type, title, tags: parseTags(input.tags), url: fileUrl, file_path: filePath, notes, used_by_agents: true })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as LearningItem;
}

export async function updateLearningItem(id: string, patch: { title?: unknown; tags?: unknown; notes?: unknown; usedByAgents?: unknown; brandId?: unknown }): Promise<LearningItem> {
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.title === "string" && patch.title.trim()) next.title = patch.title.trim().slice(0, 200);
  if (patch.tags !== undefined) next.tags = parseTags(patch.tags);
  if (typeof patch.notes === "string") next.notes = patch.notes.trim().slice(0, 20000);
  if (typeof patch.usedByAgents === "boolean") next.used_by_agents = patch.usedByAgents;
  if (patch.brandId === null || (typeof patch.brandId === "string" && /^[0-9a-f-]{36}$/i.test(patch.brandId))) next.brand_id = patch.brandId;
  const { data, error } = await db().from("learning_items").update(next).eq("id", id).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Item not found.");
  return data as LearningItem;
}

export async function removeLearningItem(id: string) {
  const { data } = await db().from("learning_items").select("file_path").eq("id", id).maybeSingle();
  const { error } = await db().from("learning_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const path = (data as { file_path?: string | null } | null)?.file_path;
  if (path) await db().storage.from(BUCKET).remove([path]).catch(() => {});
}

const TYPE_LABEL: Record<ItemType, string> = { image: "image", idea: "idea", podcast: "podcast", youtube: "YouTube", document: "document", link: "link" };

/** Pure: the prompt block from items (used by libraryContext; unit-tested). Max 10 items, excerpts ≤ 1,500 chars. */
export function libraryText(items: Array<Pick<LearningItem, "item_type" | "title" | "tags" | "url" | "notes">>, limit = LIBRARY_MAX_ITEMS) {
  if (!items.length) return "";
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return [
    "Reference materials from Mihai (use them; do not copy them word for word; never invent what they do not say):",
    ...items.slice(0, limit).map((i) => `- [${TYPE_LABEL[i.item_type]}] ${i.title}${i.tags.length ? ` (${i.tags.join(", ")})` : ""}${i.notes ? `: ${clip(i.notes.replace(/\s+/g, " "), LIBRARY_EXCERPT_CHARS)}` : ""}${i.url ? ` <${i.url}>` : ""}`)
  ].join("\n");
}

export const LIBRARY_MAX_ITEMS = 10;
export const LIBRARY_EXCERPT_CHARS = 1500;
const STOP = new Set("the and for with from that this your our are was were will can not but all any its into about over more than then them they their there here what when who how why which a an to of in on at by is it be as or we you i".split(" "));

/** Lowercase keywords (≥ 3 chars, no stop words, no pure numbers). Pure. */
export function keywords(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))));
}

type Candidate = { id: string; item_type: ItemType; title: string; tags: string[]; brand_id: string | null; created_at: string };

/**
 * Pure: the most relevant items for a run. Score = keyword overlap of the campaign text with the item's
 * title + tags (×3), +1 for the brand's own items (vs "all brands"), +1 for text items (documents and
 * ideas carry content an image title doesn't), + up to 1 for recency (last 90 days). Ties: newest first.
 */
export function rankLibraryItems(items: Candidate[], query: string, brandId: string | null | undefined, limit = LIBRARY_MAX_ITEMS, now = Date.now()): Candidate[] {
  const q = new Set(keywords(query));
  const scored = items.map((i) => {
    const words = keywords(`${i.title} ${i.tags.join(" ")}`);
    const hits = words.filter((w) => q.has(w) || [...q].some((k) => k.length > 4 && (w.startsWith(k) || k.startsWith(w)))).length;
    const ageDays = (now - Date.parse(i.created_at)) / 86_400_000;
    const score = hits * 3 + (brandId && i.brand_id === brandId ? 1 : 0) + (i.item_type === "document" || i.item_type === "idea" ? 1 : 0) + Math.max(0, 1 - ageDays / 90);
    return { i, score };
  });
  return scored.sort((a, b) => b.score - a.score || b.i.created_at.localeCompare(a.i.created_at)).slice(0, limit).map((s) => s.i);
}

/**
 * The block an agent reads for a brand: at most 10 of its items + items for all brands (used_by_agents
 * only), the most relevant to `query` (the campaign's idea), excerpts capped at 1,500 chars. When `use`
 * is given, records which items this run read (Library → "What the last runs read"). Never throws.
 */
export async function libraryContext(brandId: string | null | undefined, query = "", use?: { part: "plan" | "run"; campaignId?: string | null }): Promise<string> {
  try {
    let q = db().from("learning_items").select("id,item_type,title,tags,brand_id,created_at").eq("used_by_agents", true).order("created_at", { ascending: false }).limit(5000);
    q = brandId ? q.or(`brand_id.is.null,brand_id.eq.${brandId}`) : q.is("brand_id", null);
    const { data } = await q;
    const picked = rankLibraryItems((data ?? []) as Candidate[], query, brandId);
    if (!picked.length) return "";
    const { data: full } = await db().from("learning_items").select("id,item_type,title,tags,url,notes").in("id", picked.map((p) => p.id));
    const byId = new Map(((full ?? []) as LearningItem[]).map((f) => [f.id, f]));
    const ordered = picked.map((p) => byId.get(p.id)).filter((x): x is LearningItem => Boolean(x));
    if (use) {
      const runId = randomUUID();
      await db()
        .from("learning_item_uses")
        .insert(ordered.map((it, rank) => ({ run_id: runId, item_id: it.id, campaign_id: use.campaignId ?? null, part: use.part, rank })))
        .then(() => undefined, () => undefined);
    }
    return libraryText(ordered);
  } catch {
    return "";
  }
}

export type LibraryRunUse = { runId: string; part: string; usedAt: string; campaignId: string | null; campaignTitle: string | null; items: Array<{ id: string; title: string }> };

/** The last runs and the items each read (newest first). Never throws. */
export async function recentLibraryUses(runs = 8): Promise<LibraryRunUse[]> {
  try {
    const { data } = await db().from("learning_item_uses").select("run_id,part,used_at,campaign_id,rank,item_id").order("used_at", { ascending: false }).limit(runs * LIBRARY_MAX_ITEMS);
    const rows = (data ?? []) as Array<{ run_id: string; part: string; used_at: string; campaign_id: string | null; rank: number; item_id: string }>;
    const runIds = Array.from(new Set(rows.map((r) => r.run_id))).slice(0, runs);
    const itemIds = Array.from(new Set(rows.filter((r) => runIds.includes(r.run_id)).map((r) => r.item_id)));
    const campIds = Array.from(new Set(rows.map((r) => r.campaign_id).filter((x): x is string => Boolean(x))));
    const items = itemIds.length ? (((await db().from("learning_items").select("id,title").in("id", itemIds)).data ?? []) as Array<{ id: string; title: string }>) : [];
    const camps = campIds.length ? (((await db().from("campaigns").select("id,title").in("id", campIds)).data ?? []) as Array<{ id: string; title: string }>) : [];
    return runIds.map((runId) => {
      const rs = rows.filter((r) => r.run_id === runId).sort((a, b) => a.rank - b.rank);
      const first = rs[0];
      return {
        runId,
        part: first.part,
        usedAt: first.used_at,
        campaignId: first.campaign_id,
        campaignTitle: camps.find((c) => c.id === first.campaign_id)?.title ?? null,
        items: rs.map((r) => ({ id: r.item_id, title: items.find((i) => i.id === r.item_id)?.title ?? "(removed)" }))
      };
    });
  } catch {
    return [];
  }
}
