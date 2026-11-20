import { recordAgentRun } from "@/lib/agents/agent-runs";
import { runMarketingAgentModel } from "@/lib/agents/marketing-runner";
import { addLearningItem } from "@/lib/learning/library";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readSite, siteOf, type SitePage } from "@/lib/marketing/site-reader";
import { defaultVault, learningContext, projectFolderFor } from "@/lib/learning/vault";
import { PROPOSABLE_FIELDS, type ProposableField } from "@/lib/marketing/brand-proposals";
import { notifyOperator } from "@/lib/marketing/notify";
import { publicUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";
import type { Brand } from "@/lib/types";

/**
 * Brands → Analyze (admin 2026-11-20): Crina reads the brand fields, the ~10 most relevant Learning
 * library items for this brand (soul, truth book, prohibited claims, newsletters…) and the recent
 * Yes/Rework notes, then PROPOSES an improved value for each brand field. The proposals appear as
 * "Proposed — use / dismiss" boxes; nothing is written to the brand until the admin presses Use.
 * Runs in the background (one per brand); Telegram + Slack get a line with the Brands link when done.
 */

export type AnalysisStatus = { state: "running" | "done" | "error"; startedAt: string; finishedAt?: string; summary?: string; proposed?: number };
const status = new Map<string, AnalysisStatus>();
export const getAnalysisStatus = (brandId: string) => status.get(brandId) ?? null;
const progress = (brandId: string, text: string) => {
  const cur = status.get(brandId);
  if (cur?.state === "running") status.set(brandId, { ...cur, summary: text });
};

const FIELDS = PROPOSABLE_FIELDS.filter((f) => f !== "website");
const FIELD_HELP: Record<string, string> = {
  positioning: "one paragraph: what the brand is and why it matters",
  target_audience: "who it is for, concretely",
  tone_of_voice: "how it sounds (3-6 traits + one do / one don't)",
  pillars: "3-5 content pillars, one per line",
  seo_targets: "5-10 search terms, comma separated",
  ctas: "3-5 reusable calls to action, one per line",
  key_messages: "3-5 key messages, one per line",
  proof_points: "facts the materials actually support, one per line",
  offers: "what is offered, one per line",
  competitors: "named competitors or alternatives, comma separated"
};

/** Pure: keep only proposals that are new text for a known field (not empty, not identical to today). */
export function usefulProposals(brand: Partial<Record<string, unknown>>, raw: unknown): Array<{ field: ProposableField; value: string; sources: string[] }> {
  const proposals = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return FIELDS.flatMap((field) => {
    const raw = proposals[field];
    const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { value?: unknown }).value : raw;
    const value = (Array.isArray(v) ? v.map(String).join("\n") : typeof v === "string" ? v : "").trim().slice(0, 4000);
    const current = String(brand[field] ?? "").trim();
    const sources = raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as { sources?: unknown }).sources) ? ((raw as { sources: unknown[] }).sources.map(String).slice(0, 8)) : [];
    return value && value !== current ? [{ field, value, sources }] : [];
  });
}

export function startBrandAnalysis(brandId: string, origin: string): AnalysisStatus {
  const running = status.get(brandId);
  if (running?.state === "running") return running;
  const s: AnalysisStatus = { state: "running", startedAt: new Date().toISOString() };
  status.set(brandId, s);
  void (async () => {
    let result: AnalysisStatus;
    try {
      result = await analyze(brandId);
    } catch (error) {
      result = { state: "error", startedAt: s.startedAt, summary: error instanceof Error ? error.message.slice(0, 200) : "Analysis failed." };
    }
    result.finishedAt = new Date().toISOString();
    status.set(brandId, result);
    try {
      const supabase = createServiceClient();
      const { data } = supabase ? await supabase.from("brands").select("name").eq("id", brandId).maybeSingle() : { data: null };
      const name = (data as { name?: string } | null)?.name ?? "Brand";
      const link = publicUrl("/marketing/brands", origin).toString();
      await notifyOperator(`${result.state === "done" ? "✅" : "⚠️"} Brand "${name}": ${result.summary ?? ""}\n${link}`);
    } catch {
      // alert is best-effort
    }
  })();
  return s;
}

async function analyze(brandId: string): Promise<AnalysisStatus> {
  const startedAt = status.get(brandId)?.startedAt ?? new Date().toISOString();
  const supabase = createServiceClient();
  if (!supabase) return { state: "error", startedAt, summary: "The database is not available." };
  const { data: row } = await supabase.from("brands").select("*").eq("id", brandId).maybeSingle();
  const brand = row as Brand | null;
  if (!brand) return { state: "error", startedAt, summary: "Brand not found." };
  const date = new Date().toISOString().slice(0, 10);

  // 1) The brand's own sites (the website + its subdomains, e.g. the investor portal), rendered.
  let pages: SitePage[] = [];
  let skipped: string[] = [];
  if (brand.website) {
    const site = await readSite([brand.website], { max: 30, onProgress: (n, max, url) => progress(brandId, `Reading ${siteOf(brand.website)}: page ${n} of up to ${max} (${url.replace(/^https?:\/\//, "").slice(0, 60)})…`) });
    pages = site.pages;
    skipped = site.skipped;
  }
  // 2) All Learning library text for this brand (and for all brands): documents, ideas, links with notes.
  progress(brandId, `Read ${pages.length} web page(s). Reading the Learning library…`);
  const { data: libRows } = await supabase
    .from("learning_items")
    .select("title,item_type,notes,url,created_at")
    .or(`brand_id.eq.${brandId},brand_id.is.null`)
    .in("item_type", ["document", "idea", "link", "youtube", "podcast"])
    .eq("used_by_agents", true)
    .order("created_at", { ascending: false })
    .limit(200);
  const library = ((libRows ?? []) as Array<{ title: string; item_type: string; notes: string; url: string | null }>).filter((r) => (r.notes ?? "").trim().length > 40 && !/^brand analysis /i.test(r.title));
  const notes = (await learningContext(defaultVault(brand.name), { part: "text" })).text;

  // Numbered sources so every proposed fact can name where it came from.
  let budget = 90000;
  const webSources = pages.map((p, i) => {
    const text = p.text.slice(0, Math.max(800, Math.min(6000, budget / Math.max(1, pages.length))));
    budget -= text.length;
    return { id: `W${i + 1}`, label: p.url, body: `${p.title}\n${text}` };
  });
  let libBudget = 50000;
  const libSources = library.flatMap((r, i) => {
    if (libBudget <= 0) return [];
    const text = r.notes.replace(/\s+/g, " ").slice(0, 3000);
    libBudget -= text.length;
    return [{ id: `L${i + 1}`, label: `Library: ${r.title}`, body: text }];
  });
  const sourceText = [...webSources, ...libSources].map((src) => `[${src.id}] ${src.label}\n${src.body}`).join("\n\n");

  // 3) Crina proposes each field with its sources.
  progress(brandId, `Crina is writing the proposals from ${webSources.length} web page(s) and ${libSources.length} library item(s)…`);
  const current = Object.fromEntries(FIELDS.map((f) => [f, (brand as unknown as Record<string, unknown>)[f] ?? ""]));
  const outputSchema = {
    proposals: Object.fromEntries(FIELDS.map((f) => [f, { value: FIELD_HELP[f], sources: ["source ids used, e.g. W1, L3"] }])),
    summary: "3-4 sentences: what the brand is, what you changed and why",
    portal_notes: "one sentence on what the investor portal adds (or 'not read')"
  };
  const run = await runMarketingAgentModel({
    agentId: "agent-crina",
    fallbackAgentName: "Crina",
    fallbackRole: "Marketing CEO Agent",
    task: "Brand analysis: propose brand fields from the brand's sites and materials",
    instructions: `Analyse this brand from its own sources below (W = its website and investor portal pages, L = its Learning library: soul, truth book, prohibited claims, content rules, newsletters, decks) and the approver's past Yes/Rework notes. For each brand field, PROPOSE the improved value, written as the field itself (ready to use), and list the source ids it rests on. Follow the prohibited-claims and content rules strictly: a claim they say needs sign-off or is prohibited is left out, or said as "planned" only where they allow it. Never invent numbers, results, partners or proof; a number appears only if a source states it, with that source id. Keep a field's current text when it is already right.\n\nCurrent brand fields:\n${JSON.stringify(current, null, 1)}\n\nSOURCES:\n${sourceText}\n\n${notes}`,
    outputSchema,
    input: { brand: { name: brand.name, website: brand.website } },
    brainFiles: ["approval-rules.md"],
    temperature: 0.3,
    routeOrigin: "api.marketing.brands.analyze"
  });
  if (!run.ok || !run.json) return { state: "error", startedAt, summary: `Crina could not analyse it: ${run.error ?? "no answer"}.` };
  const json = run.json as { proposals?: unknown; summary?: unknown; portal_notes?: unknown };
  const proposals = usefulProposals(brand as unknown as Record<string, unknown>, json.proposals);
  const labelOf = new Map([...webSources, ...libSources].map((src) => [src.id, src.label]));
  const sourceLine = (ids: string[]) => ids.map((id) => `${id}: ${labelOf.get(id.replace(/[^A-Z0-9]/gi, "")) ?? id}`).join("; ");

  // 4) Proposals (use / dismiss), one open per field.
  progress(brandId, "Saving the proposals and the brand-analysis file…");
  for (const p of proposals) {
    await supabase.from("brand_field_proposals").delete().eq("brand_id", brandId).eq("field", p.field).eq("status", "proposed");
    await supabase.from("brand_field_proposals").insert({ brand_id: brandId, field: p.field, value: p.value, source: `Crina's brand analysis (${date})${p.sources.length ? ` · sources: ${sourceLine(p.sources)}`.slice(0, 900) : ""}`, status: "proposed" });
  }

  // 5) The .md: Library (used by agents) + the Hermes brain folder for the brand.
  const md = analysisMarkdown({ brand: brand.name, date, summary: String(json.summary ?? ""), portal: String(json.portal_notes ?? ""), proposals, pages, skipped, library: libSources.map((src) => src.label.replace(/^Library: /, "")), sourceLine });
  const fileName = `brand-analysis-${date}.md`;
  const saved: string[] = [];
  try {
    await addLearningItem({ type: "document", title: `Brand analysis ${date}: ${brand.name}`, brandId, tags: ["brand-analysis", date], notes: md.slice(0, 20000), file: new File([md], fileName, { type: "text/markdown" }) });
    saved.push("Learning library");
  } catch (error) {
    saved.push(`Learning library FAILED (${error instanceof Error ? error.message.slice(0, 80) : "error"})`);
  }
  const brainRoot = process.env.HERMES_WRITABLE_BRAIN_PATH;
  if (brainRoot) {
    try {
      const dir = path.join(brainRoot, "projects", projectFolderFor(brand.name));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), md, "utf8");
      saved.push(`hermes-brain/projects/${projectFolderFor(brand.name)}/${fileName}`);
    } catch (error) {
      saved.push(`brain folder FAILED (${error instanceof Error ? error.message.slice(0, 80) : "error"})`);
    }
  }

  // 6) A short summary into Crina's Hermes memory, through Hermes itself (her memory tool).
  const memo = await rememberInHermes(`Brand analysis ${date} for ${brand.name}: ${String(json.summary ?? "").slice(0, 700)} Full file: ${fileName} (Learning library + brain folder).`);
  saved.push(memo ? "Crina's Hermes memory" : "Crina's Hermes memory FAILED");

  await recordAgentRun({ agentName: "Crina", agentId: "agent-crina", workflowName: "Brand analysis (proposals)", provider: run.provider, status: "success", input: { brandId, pages: pages.length, library: libSources.length, routeOrigin: "api.marketing.brands.analyze" }, output: { proposed: proposals.map((p) => p.field), saved, summary: json.summary }, error: null, model: run.modelUsed ?? null, durationMs: run.durationMs ?? 0 });
  const summary = `${proposals.length} field proposal(s) ready from ${pages.length} web page(s) and ${libSources.length} library item(s). Saved: ${saved.join(", ")}. Open Brands to use or dismiss each.`;
  return { state: "done", startedAt, summary, proposed: proposals.length };
}

/** Pure: the dated brand-analysis file (every source URL listed). */
export function analysisMarkdown(a: { brand: string; date: string; summary: string; portal: string; proposals: Array<{ field: string; value: string; sources: string[] }>; pages: SitePage[]; skipped: string[]; library: string[]; sourceLine: (ids: string[]) => string }) {
  return [
    `# Brand analysis ${a.date}: ${a.brand}`,
    "",
    `Written by Crina (Hermes / crina) from the brand's own website, investor portal and Learning library. Proposals are not applied until the admin presses Use on the Brands page.`,
    "",
    "## Summary",
    a.summary || "(none)",
    a.portal ? `\nInvestor portal: ${a.portal}` : "",
    "",
    "## Proposed brand fields",
    ...a.proposals.flatMap((p) => [`### ${p.field.replace(/_/g, " ")}`, p.value, p.sources.length ? `_Sources: ${a.sourceLine(p.sources)}_` : "_Sources: none named_", ""]),
    "## Sources read",
    "### Web pages",
    ...a.pages.map((p, i) => `- W${i + 1}: ${p.url}${p.title ? ` (${p.title})` : ""}`),
    ...(a.skipped.length ? ["", "Skipped:", ...a.skipped.map((x) => `- ${x}`)] : []),
    "",
    "### Learning library",
    ...a.library.map((t, i) => `- L${i + 1}: ${t}`),
    ""
  ].join("\n");
}

async function rememberInHermes(text: string): Promise<boolean> {
  const endpoint = process.env.HERMES_AGENT_ENDPOINT;
  const token = process.env.HERMES_AGENT_TOKEN;
  if (!endpoint || !token) return false;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "crina", messages: [{ role: "user", content: `Save this to your long-term memory (use your memory tool) for future marketing work, then reply only SAVED.\n\n${text}` }] }),
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) return false;
    const raw = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return /saved/i.test(raw.choices?.[0]?.message?.content ?? "");
  } catch {
    return false;
  }
}
