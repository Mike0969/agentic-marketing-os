import { makeActivity } from "@/lib/activity";
import { readLocalDashboardData, updateLocalContentItem } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ContentItem } from "@/lib/types";

const workflowPatchKeys = new Set(["workflow_stage", "current_owner", "next_owner", "human_feedback_tags", "crina_review_notes", "agent_handoff_summary"]);

function stripWorkflowPatch(patch: Partial<ContentItem>) {
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !workflowPatchKeys.has(key))) as Partial<ContentItem>;
}

function isMissingWorkflowColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return error?.code === "PGRST204" || message.includes("workflow_stage") || message.includes("current_owner") || message.includes("agent_handoff_summary");
}

/** Fetch a single content item by id (Supabase or local). */
export async function getContentItem(id: string): Promise<ContentItem | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      const { data, error } = await supabase.from("content_items").select("*").eq("id", id).maybeSingle();
      if (!error && data) return data as ContentItem;
    }
  }
  const data = await readLocalDashboardData();
  return data.contentItems.find((item) => item.id === id) ?? null;
}

/** Patch a content item (Supabase or local), optionally logging an activity row. */
export async function updateContentItem(
  id: string,
  patch: Partial<ContentItem>,
  activity?: { label: string; detail: string }
): Promise<ContentItem | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient() ?? (await createClient());
    if (supabase) {
      let { data, error } = await supabase.from("content_items").update(patch).eq("id", id).select("*").single();
      if (error && isMissingWorkflowColumn(error)) {
        const safePatch = stripWorkflowPatch(patch);
        if (Object.keys(safePatch).length) {
          const retry = await supabase.from("content_items").update(safePatch).eq("id", id).select("*").single();
          data = retry.data;
          error = retry.error;
        }
      }
      if (!error && data) {
        if (activity) await supabase.from("activity").insert(makeActivity(activity.label, activity.detail));
        return data as ContentItem;
      }
    }
  }
  return updateLocalContentItem(id, patch, activity?.label, activity?.detail);
}
