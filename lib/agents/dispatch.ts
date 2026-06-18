import { subAgentConfigs, type SubAgentKey } from "@/lib/agents/agent-catalog";
import { runSubAgent } from "@/lib/agents/sub-agent-runner";
import { getContentItem, updateContentItem } from "@/lib/content-store";
import { getDashboardData } from "@/lib/data";
import type { ContentItem, ContentStatus } from "@/lib/types";

/**
 * Approval-gated dispatch. After a human approves a Crina plan item, the item's
 * assigned specialist runs on THAT item and writes its output back onto the same
 * card, advancing it through the pipeline. Nothing is published.
 */

function keyForAgent(assignedAgent: string): SubAgentKey {
  const name = assignedAgent.toLowerCase();
  if (name.includes("seo")) return "seo";
  if (name.includes("visual") || name.includes("video")) return "visual-video";
  if (name.includes("competitor")) return "competitor-intelligence";
  if (name.includes("analytic")) return "analytics";
  if (name.includes("publish")) return "publishing";
  return "content-creator"; // Crina ideas + Content Creator both draft copy
}

type DispatchPatch = Partial<ContentItem> & { status: ContentStatus };

function mapOutputToPatch(key: SubAgentKey, output: Record<string, unknown>): DispatchPatch {
  switch (key) {
    case "content-creator": {
      const draft = Array.isArray((output as { drafts?: unknown[] }).drafts) ? ((output as { drafts: Record<string, unknown>[] }).drafts[0] ?? {}) : {};
      return {
        status: "draft",
        body: typeof draft.body === "string" ? draft.body : "",
        hook: typeof draft.hook === "string" ? draft.hook : "",
        CTA: typeof draft.CTA === "string" ? draft.CTA : ""
      };
    }
    case "seo": {
      const brief = (output as { blogBrief?: { title?: string; outline?: string[]; targetKeyword?: string } }).blogBrief ?? {};
      const themes = Array.isArray((output as { keywordThemes?: string[] }).keywordThemes) ? (output as { keywordThemes: string[] }).keywordThemes : [];
      const outline = Array.isArray(brief.outline) ? brief.outline : [];
      return {
        status: "draft",
        content_type: "SEO blog brief",
        body: [brief.targetKeyword ? `Target keyword: ${brief.targetKeyword}` : "", themes.length ? `Themes: ${themes.join(", ")}` : "", outline.length ? `Outline:\n- ${outline.join("\n- ")}` : ""].filter(Boolean).join("\n\n")
      };
    }
    case "visual-video": {
      const carousels = (output as { carouselConcepts?: { title?: string; slides?: string[] }[] }).carouselConcepts ?? [];
      const scripts = (output as { shortVideoScripts?: { title?: string; beats?: string[] }[] }).shortVideoScripts ?? [];
      const lines = [
        carousels.length ? `Carousel: ${carousels[0]?.title ?? ""}\n- ${(carousels[0]?.slides ?? []).join("\n- ")}` : "",
        scripts.length ? `Short video: ${scripts[0]?.title ?? ""}\n- ${(scripts[0]?.beats ?? []).join("\n- ")}` : ""
      ].filter(Boolean);
      return { status: "visual", content_type: "Creative direction", body: lines.join("\n\n") || "Creative direction prepared." };
    }
    default:
      return { status: "draft", body: JSON.stringify(output).slice(0, 1200) };
  }
}

export type DispatchResult = {
  ok: boolean;
  item: ContentItem | null;
  agent: string;
  provider: "hermes" | "deterministic";
  error: string | null;
};

export async function dispatchContentItem(contentItemId: string): Promise<DispatchResult> {
  const item = await getContentItem(contentItemId);
  if (!item) return { ok: false, item: null, agent: "", provider: "deterministic", error: "Content item not found." };

  const key = keyForAgent(item.assigned_agent);
  const config = subAgentConfigs[key];
  const data = await getDashboardData();
  const brand = data.brands.find((b) => b.id === item.brand_id);

  const input = {
    contentItemId: item.id,
    brief: { title: item.title, hook: item.hook, body: item.body, platform: item.platform, content_type: item.content_type, CTA: item.CTA },
    brand: brand ? { name: brand.name, positioning: brand.positioning, tone: brand.tone_of_voice, audience: brand.target_audience } : null,
    instruction: "Produce a draft for this specific approved item. Drafts only — never publish."
  };

  const result = await runSubAgent(config, input);
  const patch = mapOutputToPatch(key, result.output);

  const updated = await updateContentItem(
    item.id,
    { ...patch, approval_status: "pending" },
    { label: `${result.agent} produced a draft`, detail: `${item.title} advanced to ${patch.status} by ${result.agent}.` }
  );

  return { ok: Boolean(updated), item: updated, agent: result.agent, provider: result.provider, error: result.error };
}
