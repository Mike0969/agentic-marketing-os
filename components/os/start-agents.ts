// Client helper: once the plan is cleared, run the support agents (SEO + analytics), then the
// content + visual agents. Shared by New campaign and Review ("Start the agents").

export type AgentStep = "support" | "makers";

export async function startAgents(campaignId: string, onStep: (step: AgentStep, state: "running" | "done" | "error", detail?: string) => void) {
  onStep("support", "running");
  const prep = await fetch(`/api/marketing/campaigns/${campaignId}/prepare`, { method: "POST" });
  const prepBody = (await prep.json().catch(() => ({}))) as { error?: string; seo?: { summary?: string }; analytics?: { summary?: string } };
  if (!prep.ok) {
    onStep("support", "error", prepBody.error ?? "SEO / analytics step failed.");
    return false;
  }
  onStep("support", "done", [prepBody.seo?.summary, prepBody.analytics?.summary].filter(Boolean).join(" · "));

  onStep("makers", "running");
  const run = await fetch(`/api/marketing/campaigns/${campaignId}/run`, { method: "POST" });
  const runBody = (await run.json().catch(() => ({}))) as { error?: string; posts?: Array<{ platform: string; title: string; blocked?: boolean }> };
  if (!run.ok) {
    onStep("makers", "error", runBody.error ?? "The content / visual run failed.");
    return false;
  }
  const posts = runBody.posts ?? [];
  onStep("makers", "done", posts.map((p) => `${p.platform}: ${p.title}${p.blocked ? " (blocked by safety check)" : ""}`).join(" · ") || "No posts came back.");
  return true;
}
