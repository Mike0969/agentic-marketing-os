import { randomUUID } from "crypto";
import { appendBrainResource, agentMemoryFileName } from "@/lib/agents/hermes-registry";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { AgentLearningEvent, ContentItem } from "@/lib/types";

type LearningInput = {
  contentItem: ContentItem;
  decision: string;
  feedback: string;
  tags: string[];
  source: "plan_decision" | "final_approval";
};

function agentIdForName(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("seo")) return "agent-seo";
  if (lower.includes("visual") || lower.includes("video")) return "agent-visual-video";
  if (lower.includes("competitor")) return "agent-competitor-intelligence";
  if (lower.includes("publish")) return "agent-publishing";
  if (lower.includes("analytic")) return "agent-analytics";
  if (lower.includes("crina")) return "agent-crina";
  return "agent-content-creator";
}

function buildSummary(input: LearningInput) {
  const tags = input.tags.length ? input.tags.join(", ") : "no tags";
  const feedback = input.feedback.trim() || "No written feedback.";
  return `${input.decision} on "${input.contentItem.title}" (${input.contentItem.platform}). Tags: ${tags}. Feedback: ${feedback}`;
}

function buildMemoryNote(event: Omit<AgentLearningEvent, "id" | "created_at">, source: LearningInput["source"]) {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `## Human feedback learning - ${date}`,
    `- Source: ${source}`,
    `- Decision: ${event.decision}`,
    `- Item: ${event.summary}`,
    event.tags.length ? `- Tags: ${event.tags.join(", ")}` : "",
    event.feedback ? `- Human note: ${event.feedback}` : "",
    "- Rule: Treat this as future guidance. Do not repeat rejected patterns; strengthen approved patterns."
  ]
    .filter(Boolean)
    .join("\n");
}

async function insertSupabase(event: Omit<AgentLearningEvent, "id" | "created_at">) {
  if (!isSupabaseConfigured()) return false;
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return false;

  const { error } = await supabase.from("agent_learning_events").insert({
    content_item_id: event.content_item_id,
    brand_id: event.brand_id,
    agent_id: event.agent_id,
    agent_name: event.agent_name,
    decision: event.decision,
    feedback: event.feedback,
    tags: event.tags,
    summary: event.summary
  });

  return !error;
}

export async function recordAgentLearning(input: LearningInput) {
  const agentId = agentIdForName(input.contentItem.assigned_agent);
  const summary = buildSummary(input);
  const event = {
    content_item_id: input.contentItem.id,
    brand_id: input.contentItem.brand_id,
    agent_id: agentId,
    agent_name: input.contentItem.assigned_agent || "Crina",
    decision: input.decision,
    feedback: input.feedback.trim(),
    tags: input.tags,
    summary
  };

  await insertSupabase(event);

  const note = buildMemoryNote(event, input.source);
  await Promise.allSettled([
    appendBrainResource("agent-crina-memory.md", note),
    appendBrainResource(agentMemoryFileName(agentId), note),
    appendBrainResource(input.tags.some((tag) => tag.toLowerCase().includes("hook")) ? "weak-hooks.md" : "approval-rules.md", note)
  ]);

  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...event
  } satisfies AgentLearningEvent;
}

export async function listAgentLearningEvents(limit = 20): Promise<AgentLearningEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return [];

  const { data, error } = await supabase.from("agent_learning_events").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as AgentLearningEvent[];
}
