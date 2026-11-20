import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Learning vault: an Obsidian-style folder of markdown notes per project.
 * Every Rework Mihai asks for is saved with his reason and the rejected item;
 * every Yes is saved as a good example. Crina, the agents and Jev read the
 * notes before working. This is memory the agents read every time, not model
 * training.
 *
 * Storage sits behind VaultStorage: disk today (the test copy), a Supabase
 * Storage adapter later for a serverless production deploy.
 */

export type VaultStorage = {
  write(relativePath: string, content: string): Promise<void>;
  read(relativePath: string): Promise<string | null>;
  /** File names (not paths) directly inside a folder; [] if it does not exist. */
  list(relativeDir: string): Promise<string[]>;
};

export function diskStorage(root: string): VaultStorage {
  const resolve = (relative: string) => {
    const full = path.resolve(root, relative);
    if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep)) throw new Error("Vault path escapes its root.");
    return full;
  };
  return {
    async write(relative, content) {
      const full = resolve(relative);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, "utf8");
    },
    async read(relative) {
      try {
        return await readFile(resolve(relative), "utf8");
      } catch {
        return null;
      }
    },
    async list(relativeDir) {
      try {
        return (await readdir(resolve(relativeDir))).filter((name) => name.endsWith(".md")).sort();
      } catch {
        return [];
      }
    }
  };
}

export type LearningKind = "rejected" | "approved";
export type LearningPart = "plan" | "text" | "visual";

export type LearningNote = {
  kind: LearningKind;
  part: LearningPart;
  date: string;
  campaign: string;
  platform: string;
  agent: string;
  reason: string;
  item: string;
  file: string;
};

const PROJECT_FOLDER: Record<string, string> = { gulf_el_nexride: "gulf-el-nexride", gridfactory: "gridfactory" };

export function projectFolderFor(brandName: string | null | undefined) {
  const name = (brandName ?? "").toLowerCase();
  if (name.includes("gulf") || name.includes("nexride")) return PROJECT_FOLDER.gulf_el_nexride;
  if (name.includes("gridfactory")) return PROJECT_FOLDER.gridfactory;
  return name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

/** Default storage: <writable brain>/projects/<project>/learning on disk. */
export function defaultVault(brandName: string | null | undefined): VaultStorage | null {
  const base = process.env.HERMES_WRITABLE_BRAIN_PATH || process.env.HERMES_BRAIN_PATH;
  if (!base) return null;
  return diskStorage(path.join(base, "projects", projectFolderFor(brandName), "learning"));
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "note";
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

export function noteMarkdown(note: Omit<LearningNote, "file">) {
  const title = note.kind === "rejected" ? `Rejected ${note.part}: ${note.campaign}` : `Approved ${note.part}: ${note.campaign}`;
  return [
    "---",
    `kind: ${note.kind}`,
    `part: ${note.part}`,
    `date: ${note.date}`,
    `campaign: ${oneLine(note.campaign)}`,
    `platform: ${oneLine(note.platform)}`,
    `agent: ${oneLine(note.agent)}`,
    `reason: ${oneLine(note.reason)}`,
    "---",
    "",
    `# ${title}`,
    "",
    note.kind === "rejected" ? `**Why Mihai said Rework:** ${note.reason}` : `**Mihai said Yes.**${note.reason ? ` ${note.reason}` : ""}`,
    "",
    "## The item",
    "",
    note.item.trim(),
    "",
    "Back to [[index]]",
    ""
  ].join("\n");
}

export function parseNote(file: string, markdown: string): LearningNote | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const meta = Object.fromEntries(
    match[1].split("\n").map((line) => {
      const at = line.indexOf(":");
      return at < 0 ? [line, ""] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    })
  );
  const kind = meta.kind === "approved" ? "approved" : meta.kind === "rejected" ? "rejected" : null;
  const part = meta.part === "plan" || meta.part === "visual" ? meta.part : meta.part === "text" ? "text" : null;
  if (!kind || !part) return null;
  const item = (match[2].split("## The item")[1] ?? "").replace(/Back to \[\[index\]\]\s*$/, "").trim();
  return { kind, part, date: meta.date ?? "", campaign: meta.campaign ?? "", platform: meta.platform ?? "", agent: meta.agent ?? "", reason: meta.reason ?? "", item, file };
}

async function writeIndex(storage: VaultStorage) {
  const [rejected, approved] = await Promise.all([storage.list("rejected"), storage.list("approved")]);
  const links = (dir: string, files: string[]) => files.slice().reverse().map((file) => `- [[${dir}/${file.replace(/\.md$/, "")}]]`).join("\n") || "- none yet";
  await storage.write(
    "index.md",
    [
      "# Learning notes",
      "",
      "What Mihai rejected (with his reason) and approved. Crina, every agent and Jev read these before working.",
      "This is memory the agents read every time, not model training.",
      "",
      `## Don't repeat (${rejected.length})`,
      links("rejected", rejected),
      "",
      `## Good examples (${approved.length})`,
      links("approved", approved),
      ""
    ].join("\n")
  );
}

/** Save one decision as a note. Never throws: learning must not break a review. */
export async function recordLearning(
  storage: VaultStorage | null,
  note: Omit<LearningNote, "file" | "date"> & { date?: string; now?: Date }
): Promise<string | null> {
  if (!storage) return null;
  try {
    const now = note.now ?? new Date();
    const date = note.date ?? now.toISOString().slice(0, 10);
    const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
    const file = `${note.kind}/${date}-${stamp.slice(9)}-${note.part}-${slug(note.campaign)}.md`;
    await storage.write(file, noteMarkdown({ ...note, date }));
    await writeIndex(storage);
    return file;
  } catch {
    return null;
  }
}

export async function listLearningNotes(storage: VaultStorage | null): Promise<LearningNote[]> {
  if (!storage) return [];
  const notes: LearningNote[] = [];
  for (const dir of ["rejected", "approved"] as const) {
    for (const name of await storage.list(dir)) {
      const markdown = await storage.read(`${dir}/${name}`);
      const note = markdown ? parseNote(`${dir}/${name}`, markdown) : null;
      if (note) notes.push(note);
    }
  }
  return notes.sort((a, b) => (a.file < b.file ? 1 : -1));
}

/**
 * The block every agent and Jev get before working: "Don't repeat: …" and
 * "Good examples: …", newest first, limited so prompts stay small.
 */
export async function learningContext(storage: VaultStorage | null, options: { part?: LearningPart; limit?: number } = {}) {
  const limit = options.limit ?? 6;
  const notes = (await listLearningNotes(storage)).filter((note) => !options.part || note.part === options.part);
  const dontRepeat = notes.filter((note) => note.kind === "rejected").slice(0, limit);
  const good = notes.filter((note) => note.kind === "approved").slice(0, limit);
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
  const text = [
    "Learning notes from Mihai's past decisions (read these before working):",
    "Don't repeat:",
    ...(dontRepeat.length ? dontRepeat.map((note) => `- [${note.part}] ${note.reason} — rejected: "${clip(oneLine(note.item), 220)}"`) : ["- none yet"]),
    "Good examples:",
    ...(good.length ? good.map((note) => `- [${note.part}] "${clip(oneLine(note.item), 220)}"`) : ["- none yet"])
  ].join("\n");
  return { text, dontRepeat, good };
}
