import { mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { addLearningItem, typeForUrl } from "@/lib/learning/library";
import { projectFolderFor } from "@/lib/learning/vault";

/**
 * Server inbox for bulk materials: <inbox>/<brand-folder>/ (e.g. gulf-el-nexride, gridfactory, or "all").
 * Every file becomes a Learning library item (used by agents ON), then moves to <brand-folder>/imported/.
 *   images -> Image · pdf/doc(x)/ppt(x)/xls(x)/csv/md/txt -> Document (md/txt: title from the first heading,
 *   a short summary + the text as notes) · links.txt -> one YouTube/Podcast/Web link per line ("Title | url"
 *   or just the url) · ideas.md -> one Idea per "## heading" section.
 */

export const DEFAULT_INBOX = process.env.LEARNING_INBOX_PATH || "/home/ubuntu/marketing-os/inbox";

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".pdf": "application/pdf", ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv", ".md": "text/markdown", ".txt": "text/plain"
};

/** Title from the first markdown heading; summary = the first prose line(s), ≤ 300 chars. Pure (tested). */
export function summarizeMarkdown(text: string, fallbackTitle: string) {
  const lines = text.split(/\r?\n/);
  const heading = lines.find((l) => /^#{1,3}\s+\S/.test(l));
  const title = heading ? heading.replace(/^#{1,3}\s+/, "").trim().slice(0, 200) : fallbackTitle;
  const prose = lines.filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !/^[-*]\s|^\d+\.\s|^\|/.test(l.trim())).map((l) => l.trim());
  let summary = "";
  for (const l of prose) {
    if ((summary + " " + l).length > 300) break;
    summary = summary ? `${summary} ${l}` : l;
    if (summary.length > 120) break;
  }
  return { title, summary: summary || prose[0]?.slice(0, 300) || "" };
}

/** ideas.md -> one idea per "## heading". Pure (tested). */
export function splitIdeas(text: string): Array<{ title: string; notes: string }> {
  return text
    .split(/^##\s+/m)
    .slice(1)
    .map((block) => {
      const [first, ...rest] = block.split(/\r?\n/);
      return { title: first.trim().slice(0, 200), notes: rest.join("\n").trim() };
    })
    .filter((i) => i.title && i.notes);
}

/** links.txt -> links ("Title | url" or a bare url; # comments ignored). Pure (tested). */
export function parseLinks(text: string): Array<{ title: string; url: string }> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [a, b] = l.includes("|") ? l.split("|").map((x) => x.trim()) : ["", l];
      const url = (b || a).match(/https?:\/\/\S+/)?.[0] ?? "";
      const title = a || url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80);
      return { title, url };
    })
    .filter((l) => l.url);
}

export async function importInbox(brands: Array<{ id: string; name: string }>, root = DEFAULT_INBOX): Promise<{ added: number; skipped: string[] }> {
  let added = 0;
  const skipped: string[] = [];
  const folders = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const folder of folders.filter((d) => d.isDirectory())) {
    const brand = folder.name === "all" ? null : brands.find((b) => projectFolderFor(b.name) === folder.name) ?? null;
    if (folder.name !== "all" && !brand) {
      skipped.push(`${folder.name}/ (no brand matches this folder name)`);
      continue;
    }
    const dir = path.join(root, folder.name);
    const doneDir = path.join(dir, "imported");
    const files = (await readdir(dir, { withFileTypes: true })).filter((f) => f.isFile() && !f.name.startsWith("."));
    for (const f of files) {
      const full = path.join(dir, f.name);
      const ext = path.extname(f.name).toLowerCase();
      const base = { brandId: brand?.id ?? null, tags: [folder.name === "all" ? "inbox" : folder.name, ...f.name.replace(/\.[^.]+$/, "").split(/[-_\s]+/).filter((w) => w.length > 2).slice(0, 3)] };
      try {
        if ((await stat(full)).size > 20 * 1024 * 1024) throw new Error("larger than 20 MB");
        if (f.name.toLowerCase() === "links.txt") {
          for (const link of parseLinks(await readFile(full, "utf8"))) {
            await addLearningItem({ type: typeForUrl(link.url), title: link.title, url: link.url, ...base });
            added++;
          }
        } else if (f.name.toLowerCase() === "ideas.md") {
          for (const idea of splitIdeas(await readFile(full, "utf8"))) {
            await addLearningItem({ type: "idea", title: idea.title, notes: idea.notes, ...base });
            added++;
          }
        } else if (MIME[ext]) {
          const bytes = await readFile(full);
          let title: string | undefined;
          let notes = "";
          if (ext === ".md" || ext === ".txt") {
            const text = bytes.toString("utf8");
            const s = summarizeMarkdown(text, f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
            title = s.title;
            notes = `${s.summary}\n\n${text}`.slice(0, 20000);
          }
          const file = new File([bytes], f.name, { type: MIME[ext] });
          await addLearningItem({ type: MIME[ext].startsWith("image/") ? "image" : "document", title, notes, file, ...base });
          added++;
        } else {
          skipped.push(`${folder.name}/${f.name} (unsupported type)`);
          continue;
        }
        await mkdir(doneDir, { recursive: true, mode: 0o700 });
        await rename(full, path.join(doneDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${f.name}`));
      } catch (error) {
        skipped.push(`${folder.name}/${f.name} (${error instanceof Error ? error.message : "failed"})`);
      }
    }
  }
  return { added, skipped };
}
