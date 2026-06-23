import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type CampaignAutomationStatus =
  | "idle"
  | "running"
  | "paused"
  | "needs_attention"
  | "waiting_human"
  | "publishing_prep"
  | "complete";

type AutomationPatch = {
  automation_status?: CampaignAutomationStatus;
  automation_locked_until?: string | null;
  automation_last_tick_at?: string | null;
  automation_error?: string | null;
  automation_no_progress_count?: number;
  automation_started_at?: string | null;
};

const LOCK_MS = 1000 * 60 * 5;

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createServiceClient() ?? (await createClient());
}

function lockUntil() {
  return new Date(Date.now() + LOCK_MS).toISOString();
}

export async function acquireCampaignAutomationLock(campaignId: string) {
  const supabase = await getSupabase();
  if (!supabase) return { ok: true as const, mode: "local" as const };

  const { data, error } = await supabase
    .from("campaigns")
    .update({
      automation_status: "running",
      automation_locked_until: lockUntil(),
      automation_last_tick_at: new Date().toISOString(),
      automation_error: null
    })
    .eq("id", campaignId)
    .or(`automation_locked_until.is.null,automation_locked_until.lt.${new Date().toISOString()}`)
    .select("id,automation_status")
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }

  if (!data) {
    return {
      ok: false as const,
      status: 409,
      error: "Campaign automation is already running in another tab or process."
    };
  }

  return { ok: true as const, mode: "supabase" as const };
}

export async function setCampaignAutomationState(campaignId: string, patch: AutomationPatch) {
  const supabase = await getSupabase();
  if (!supabase) return;

  await supabase
    .from("campaigns")
    .update({
      automation_last_tick_at: new Date().toISOString(),
      ...patch
    })
    .eq("id", campaignId);
}

export async function releaseCampaignAutomationLock(
  campaignId: string,
  status: CampaignAutomationStatus,
  options: { error?: string | null; noProgressCount?: number } = {}
) {
  await setCampaignAutomationState(campaignId, {
    automation_status: status,
    automation_locked_until: null,
    automation_error: options.error ?? null,
    ...(typeof options.noProgressCount === "number" ? { automation_no_progress_count: options.noProgressCount } : {})
  });
}
