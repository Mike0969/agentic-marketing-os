// Autonomy readiness self-check.
//
// One place that answers: "is the autonomous loop actually live, or silently
// running in fallback?" It inspects configuration (env) only — it never performs
// network calls and never returns secret VALUES, only the NAMES of missing env
// vars. Live connectivity (does Hermes answer, does Supabase accept the key) is a
// separate concern; this reports whether each capability is wired at all.
//
// Pure and dependency-injected (`env` is a parameter) so it is trivially testable.

export type CapabilityTier = "required" | "recommended" | "optional";
export type CapabilityStatus = "ready" | "disabled" | "missing";

export interface Capability {
  key: string;
  label: string;
  tier: CapabilityTier;
  status: CapabilityStatus;
  /** Plain-English, operator-facing explanation of the current state. */
  detail: string;
  /** Names (never values) of env vars that would move this capability to ready. */
  missingEnv: string[];
}

export type OverallStatus = "autonomous" | "degraded" | "fallback";

export interface ReadinessReport {
  overall: OverallStatus;
  /** One-line plain-English summary suitable for a non-technical operator. */
  summary: string;
  generatedAt: string;
  capabilities: Capability[];
  /** Convenience rollups. */
  requiredReady: number;
  requiredTotal: number;
}

type Env = Record<string, string | undefined>;

function has(env: Env, key: string): boolean {
  const v = env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function firstPresent(env: Env, keys: string[]): boolean {
  return keys.some((k) => has(env, k));
}

// A capability is `ready` when its wiring is present, `disabled` when it is
// intentionally switched off (present config but an explicit off-flag), and
// `missing` when required config is absent.
function cap(
  key: string,
  label: string,
  tier: CapabilityTier,
  ready: boolean,
  detail: string,
  missingEnv: string[] = []
): Capability {
  return { key, label, tier, status: ready ? "ready" : "missing", detail, missingEnv: ready ? [] : missingEnv };
}

export function computeReadiness(env: Env = process.env as Env): ReadinessReport {
  const capabilities: Capability[] = [];

  // 1. Database — the shared state the loop reads/writes. Without the service
  //    role key the cron cannot run global automation (it degrades to local JSON).
  const dbReady = has(env, "NEXT_PUBLIC_SUPABASE_URL") && has(env, "SUPABASE_SERVICE_ROLE_KEY");
  capabilities.push(
    cap(
      "database",
      "Database (Supabase)",
      "required",
      dbReady,
      dbReady
        ? "Connected: the automation cron can read campaigns and write content items."
        : "Not configured — the app runs on local seed data and the global automation cron is a no-op.",
      ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    )
  );

  // 2. Autopilot trigger — the Vercel cron authenticates as a machine with this
  //    token. Without it, the every-2-minutes heartbeat cannot pass the auth gate
  //    (there is no browser session on a cron call), so nothing runs unattended.
  const triggerReady = has(env, "AGENT_TRIGGER_TOKEN");
  capabilities.push(
    cap(
      "autopilot-trigger",
      "Autopilot trigger token",
      "required",
      triggerReady,
      triggerReady
        ? "Set: the scheduled cron can authenticate and drive the loop without a human logged in."
        : "Missing — the scheduled cron cannot authenticate itself, so unattended automation will not run.",
      ["AGENT_TRIGGER_TOKEN"]
    )
  );

  // 3. Agent brain (Hermes) — produces real content. Without it every agent step
  //    still "runs" but returns deterministic FALLBACK output.
  const brainReady = has(env, "HERMES_AGENT_ENDPOINT") && has(env, "HERMES_AGENT_TOKEN");
  capabilities.push(
    cap(
      "agent-brain",
      "Agent brain (Hermes)",
      "required",
      brainReady,
      brainReady
        ? "Connected: agents generate real drafts."
        : "Not configured — agents will run but only produce deterministic FALLBACK placeholder output.",
      ["HERMES_AGENT_ENDPOINT", "HERMES_AGENT_TOKEN"]
    )
  );

  // 4. Search analytics (GSC) — feeds the learning loop. Ready with either a
  //    static token or a service-account key, plus a site to query.
  const gscAuth = firstPresent(env, ["GOOGLE_SEARCH_CONSOLE_TOKEN", "GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]);
  const gscSite = firstPresent(env, ["GOOGLE_SEARCH_CONSOLE_SITE", "GOOGLE_SEARCH_CONSOLE_SITE_GRIDFACTORY", "GOOGLE_SEARCH_CONSOLE_SITE_GULF_EL"]);
  const gscReady = gscAuth && gscSite;
  capabilities.push(
    cap(
      "analytics",
      "Search analytics (Google Search Console)",
      "recommended",
      gscReady,
      gscReady
        ? "Connected: the cron ingests real search performance to guide the learning loop."
        : "Not configured — the self-tuning loop has no real search data and analytics panels stay in sample mode.",
      ["GOOGLE_SEARCH_CONSOLE_TOKEN (or GOOGLE_SERVICE_ACCOUNT_KEY)", "GOOGLE_SEARCH_CONSOLE_SITE"]
    )
  );

  // 5. Live social posting — governance-gated. Even when ready, human approval is
  //    still required before anything is scheduled/posted. We report both the
  //    master switch and whether any network OAuth app is configured.
  const postingEnabled = env.SOCIAL_POSTING_ENABLED === "true";
  const networks: Array<[string, string, string]> = [
    ["Facebook", "FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET"],
    ["Instagram", "INSTAGRAM_CLIENT_ID", "INSTAGRAM_CLIENT_SECRET"],
    ["TikTok", "TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"],
    ["LinkedIn", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    ["X", "X_CLIENT_ID", "X_CLIENT_SECRET"]
  ];
  const connectedNetworks = networks.filter(([, id, secret]) => has(env, id) && has(env, secret)).map(([name]) => name);
  const postingReady = postingEnabled && connectedNetworks.length > 0;
  const postingDetail = postingReady
    ? `Enabled with OAuth apps for: ${connectedNetworks.join(", ")}. Human approval is still required before any post is scheduled.`
    : !postingEnabled
      ? "Off by design (SOCIAL_POSTING_ENABLED is not \"true\"). Approved posts are prepared but never published — the safe default."
      : "No social network OAuth app is configured, so approved posts cannot be published even though posting is enabled.";
  capabilities.push({
    key: "social-posting",
    label: "Live social posting",
    tier: "optional",
    status: postingReady ? "ready" : postingEnabled ? "missing" : "disabled",
    detail: postingDetail,
    missingEnv: postingReady ? [] : postingEnabled ? ["<network>_CLIENT_ID", "<network>_CLIENT_SECRET"] : ["SOCIAL_POSTING_ENABLED=true"]
  });

  // 6. Operator notifications (Telegram or Slack) — how the loop pings a human.
  const notifyReady = firstPresent(env, ["TELEGRAM_BOT_TOKEN", "SLACK_BOT_TOKEN"]);
  capabilities.push(
    cap(
      "notifications",
      "Operator notifications (Telegram / Slack)",
      "recommended",
      notifyReady,
      notifyReady
        ? "Connected: the loop can ping you when items are ready to post or need attention."
        : "Not configured — the loop runs silently; you will not get ready-to-post or weekly-summary pings.",
      ["TELEGRAM_BOT_TOKEN (or SLACK_BOT_TOKEN)"]
    )
  );

  // 7. Nurture email (Resend) — the funnel drip. Optional.
  const emailReady = has(env, "RESEND_API_KEY");
  capabilities.push(
    cap(
      "email-nurture",
      "Nurture email (Resend)",
      "optional",
      emailReady,
      emailReady
        ? "Connected: due nurture emails are sent on the cron."
        : "Not configured — the nurture drip is a no-op until an email key is set.",
      ["RESEND_API_KEY"]
    )
  );

  // 8. Image generation — real media vs. placeholder assets. Optional.
  const imageReady = firstPresent(env, ["OPENAI_API_KEY", "REPLICATE_API_TOKEN", "STABILITY_API_KEY", "HF_API_KEY", "HUGGINGFACE_API_KEY"]);
  capabilities.push(
    cap(
      "image-generation",
      "Image generation",
      "optional",
      imageReady,
      imageReady
        ? "Connected: agents can generate real visuals."
        : "Not configured — visual steps produce labelled placeholder assets.",
      ["OPENAI_API_KEY (or another image provider key)"]
    )
  );

  const required = capabilities.filter((c) => c.tier === "required");
  const requiredReady = required.filter((c) => c.status === "ready").length;
  const requiredTotal = required.length;
  const missingRequired = required.filter((c) => c.status !== "ready");

  let overall: OverallStatus;
  let summary: string;
  if (missingRequired.length === 0) {
    overall = "autonomous";
    summary = "Fully wired: the loop can run unattended and produce real work.";
  } else if (requiredReady === 0) {
    overall = "fallback";
    summary = `Running in fallback only — set ${missingRequired.map((c) => c.label).join(", ")} to go live.`;
  } else {
    overall = "degraded";
    summary = `Partly wired — still needed for full autonomy: ${missingRequired.map((c) => c.label).join(", ")}.`;
  }

  return {
    overall,
    summary,
    generatedAt: new Date().toISOString(),
    capabilities,
    requiredReady,
    requiredTotal
  };
}
