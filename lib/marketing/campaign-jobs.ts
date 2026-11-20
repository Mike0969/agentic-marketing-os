import { randomUUID } from "node:crypto";
import { notifyOperator } from "@/lib/marketing/notify";
import { publicUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Long campaign actions run on the server, not in the browser request (Mihai 2026-11-20: "why do I
 * need to stay on the page? The platform should notify me"). The job lives in idea_brief.job; the
 * work runs as a detached task in the server process, so closing the tab never stops it. When it ends
 * (or needs Mihai) Telegram + Slack get one line with a link to the campaign's Review page, and the
 * app header shows it until he opens that page. The cron marks a job interrupted by a restart.
 */

export type JobState = "running" | "ready" | "blocked" | "error" | "needs_you";
export type CampaignJob = {
  id: string;
  kind: string;
  label: string;
  state: JobState;
  started_at: string;
  finished_at?: string | null;
  summary?: string | null;
  seen_at?: string | null;
};
export type JobOutcome = { state: Exclude<JobState, "running">; summary: string };

/** A job still "running" after this long was cut off (server restart): the cron marks it. */
export const JOB_STALE_MS = 20 * 60 * 1000;

function db() {
  return createServiceClient();
}

/** Merge into idea_brief.job, re-reading the brief first so concurrent brief writes are kept. */
export async function setJob(campaignId: string, patch: Partial<CampaignJob>): Promise<CampaignJob | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase.from("campaigns").select("idea_brief").eq("id", campaignId).maybeSingle();
  const brief = ((data as { idea_brief?: Record<string, unknown> } | null)?.idea_brief ?? {}) as Record<string, unknown>;
  const job = { ...((brief.job as CampaignJob | undefined) ?? {}), ...patch } as CampaignJob;
  await supabase.from("campaigns").update({ idea_brief: { ...brief, job } }).eq("id", campaignId);
  return job;
}

export async function getJob(campaignId: string): Promise<CampaignJob | null> {
  const supabase = db();
  if (!supabase) return null;
  const { data } = await supabase.from("campaigns").select("idea_brief").eq("id", campaignId).maybeSingle();
  return (((data as { idea_brief?: Record<string, unknown> } | null)?.idea_brief ?? {}).job as CampaignJob | undefined) ?? null;
}

const ICON: Record<JobOutcome["state"], string> = { ready: "✅", blocked: "⛔", error: "⚠️", needs_you: "👋" };

/** Telegram + Slack (header added by notifyOperator): campaign name, one-line result, Review link. */
export async function notifyJob(campaignId: string, outcome: JobOutcome, origin: string): Promise<void> {
  try {
    const supabase = db();
    const { data } = supabase ? await supabase.from("campaigns").select("title").eq("id", campaignId).maybeSingle() : { data: null };
    const title = (data as { title?: string } | null)?.title ?? "Campaign";
    const link = publicUrl(`/marketing/review/${campaignId}`, origin).toString();
    await notifyOperator(`${ICON[outcome.state]} "${title}": ${outcome.summary}\n${link}`);
  } catch {
    // alerts are best-effort
  }
}

export async function finishJob(campaignId: string, outcome: JobOutcome, origin: string): Promise<void> {
  await setJob(campaignId, { state: outcome.state, summary: outcome.summary.slice(0, 400), finished_at: new Date().toISOString(), seen_at: null });
  await notifyJob(campaignId, outcome, origin);
}

/**
 * Record the job, then run `work` detached (not awaited by the request). Returns the job right away.
 * Never throws; a crash in `work` ends the job as "error" with the reason, and alerts.
 */
export async function startCampaignJob(args: { campaignId: string; kind: string; label: string; origin: string; work: () => Promise<JobOutcome> }): Promise<CampaignJob> {
  const job: CampaignJob = { id: randomUUID(), kind: args.kind, label: args.label, state: "running", started_at: new Date().toISOString(), finished_at: null, summary: null, seen_at: null };
  await setJob(args.campaignId, job);
  void (async () => {
    let outcome: JobOutcome;
    try {
      outcome = await args.work();
    } catch (error) {
      outcome = { state: "error", summary: `The agents stopped with an error: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}. Press "Run the agents again".` };
    }
    await finishJob(args.campaignId, outcome, args.origin);
  })();
  return job;
}

/** Pure: one line for Mihai from the run route's answer. */
export function runOutcome(status: number, body: { error?: string; posts?: Array<{ platform: string; title: string; blocked?: boolean; stop?: string }> }): JobOutcome {
  if (status >= 400) return { state: "error", summary: body.error ?? `The agents could not run (HTTP ${status}).` };
  const posts = body.posts ?? [];
  const ready = posts.filter((p) => !p.blocked);
  const blocked = posts.filter((p) => p.blocked);
  if (!posts.length) return { state: "error", summary: "The agents finished without a post. Press \"Run the agents again\"." };
  if (ready.length && !blocked.length) return { state: "ready", summary: `ready for your review: ${ready.map((p) => `${p.platform} "${p.title}"`).join(", ")}.` };
  if (ready.length) return { state: "ready", summary: `ready for your review: ${ready.map((p) => p.platform).join(", ")}; blocked: ${blocked.map((p) => p.platform).join(", ")}.` };
  const failed = blocked.every((p) => p.stop === "error");
  return failed
    ? { state: "error", summary: `the agents could not finish ${blocked.map((p) => p.platform).join(", ")}. Open it to see why.` }
    : { state: "blocked", summary: `blocked by the safety check (${blocked.map((p) => p.platform).join(", ")}). Open it to see the flagged sentences.` };
}

/** Cron: jobs still "running" long after they started were cut off (server restart): end + alert. */
export async function markStaleJobs(origin: string, now = Date.now()): Promise<number> {
  const supabase = db();
  if (!supabase) return 0;
  const { data } = await supabase.from("campaigns").select("id,idea_brief").limit(500);
  let marked = 0;
  for (const row of (data ?? []) as Array<{ id: string; idea_brief: Record<string, unknown> | null }>) {
    const job = (row.idea_brief?.job ?? null) as CampaignJob | null;
    if (job?.state === "running" && now - Date.parse(job.started_at) > JOB_STALE_MS) {
      await finishJob(row.id, { state: "error", summary: `"${job.label}" was interrupted (the server restarted). Press "Run the agents again".` }, origin);
      marked += 1;
    }
  }
  return marked;
}

/** For the header: finished jobs Mihai has not opened yet (newest first). */
export async function unseenJobs(limit = 8): Promise<Array<{ campaignId: string; title: string; job: CampaignJob }>> {
  try {
    const supabase = db();
    if (!supabase) return [];
    const { data } = await supabase.from("campaigns").select("id,title,idea_brief").order("created_at", { ascending: false }).limit(200);
    return ((data ?? []) as Array<{ id: string; title: string; idea_brief: Record<string, unknown> | null }>)
      .map((row) => ({ campaignId: row.id, title: row.title, job: (row.idea_brief?.job ?? null) as CampaignJob | null }))
      .filter((r): r is { campaignId: string; title: string; job: CampaignJob } => Boolean(r.job && r.job.state !== "running" && !r.job.seen_at && r.job.finished_at))
      .sort((a, b) => String(b.job.finished_at).localeCompare(String(a.job.finished_at)))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function markJobSeen(campaignId: string): Promise<void> {
  const job = await getJob(campaignId);
  if (job && job.state !== "running" && !job.seen_at) await setJob(campaignId, { seen_at: new Date().toISOString() });
}
