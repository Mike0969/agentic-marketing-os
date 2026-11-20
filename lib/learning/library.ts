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

/** Pure: the prompt block from items (used by libraryContext; unit-tested). */
export function libraryText(items: Array<Pick<LearningItem, "item_type" | "title" | "tags" | "url" | "notes">>, limit = 12) {
  if (!items.length) return "";
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return [
    "Reference materials from Mihai (use them; do not copy them word for word; never invent what they do not say):",
    ...items.slice(0, limit).map((i) => `- [${TYPE_LABEL[i.item_type]}] ${i.title}${i.tags.length ? ` (${i.tags.join(", ")})` : ""}${i.notes ? `: ${clip(i.notes.replace(/\s+/g, " "), 400)}` : ""}${i.url ? ` <${i.url}>` : ""}`)
  ].join("\n");
}

/** The block every agent reads for a brand: its items + items for all brands, used_by_agents only. Never throws. */
export async function libraryContext(brandId: string | null | undefined): Promise<string> {
  try {
    let q = db().from("learning_items").select("item_type,title,tags,url,notes,brand_id").eq("used_by_agents", true).order("created_at", { ascending: false }).limit(30);
    q = brandId ? q.or(`brand_id.is.null,brand_id.eq.${brandId}`) : q.is("brand_id", null);
    const { data } = await q;
    return libraryText((data ?? []) as LearningItem[]);
  } catch {
    return "";
  }
}
