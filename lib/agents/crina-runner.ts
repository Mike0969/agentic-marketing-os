import { generateWeeklyContentPlan } from "@/lib/workflows/weekly-content-plan";
import { recordAgentRun } from "@/lib/agents/agent-runs";
import { resolveAgentModel } from "@/lib/agents/agent-config-store";
import { resolveHermesEndpoint } from "@/lib/agents/hermes-client";
import { buildBrainContext, getHermesAgentProfile, type HermesAgentProfile } from "@/lib/agents/hermes-registry";
import type { DashboardData, GeneratedContentPlanItem, WeeklyContentPlanInput, WeeklyContentPlanOutput } from "@/lib/types";

const CRINA_AGENT_ID = "agent-crina";
const WORKFLOW_NAME = "Generate Weekly Content Plan";
const HANDOFF_TO = "Content Pipeline (Idea/Brief)";

type HermesUsage = { prompt: number | null; completion: number | null; total: number | null };

export async function runCrinaWeeklyContentPlan(input: WeeklyContentPlanInput, data: DashboardData) {
  const endpoint = await resolveHermesEndpoint();
  const profile = await getHermesAgentProfile(CRINA_AGENT_ID);
  const brain = await buildBrainContext();
  const primaryModel = await resolveAgentModel(CRINA_AGENT_ID, process.env.HERMES_AGENT_MODEL || "gpt-5.5");
  const backupModel = process.env.HERMES_AGENT_BACKUP_MODEL || null;
  const startedAt = Date.now();

  if (endpoint) {
    try {
      const { response, modelUsed } = await callHermesWithBackup(endpoint, input, data, profile, brain.text, primaryModel);
      const status = response.status;

      if (!response.ok) {
        throw new Error(`Hermes returned HTTP ${response.status}`);
      }

      const raw = (await response.json()) as unknown;
      const usage = extractUsage(raw);
      const candidate = endpoint.includes("/v1/chat/completions") ? parseOpenAiCompatibleResponse(raw) : raw;
      const plan = validatePlan(candidate, input, data);

      await recordAgentRun({
        agentName: "Crina",
        agentId: CRINA_AGENT_ID,
        workflowName: WORKFLOW_NAME,
        provider: "hermes",
        status: "success",
        input,
        output: plan as unknown as Record<string, unknown>,
        error: null,
        model: modelUsed,
        backupModel,
        tokensPrompt: usage.prompt,
        tokensCompletion: usage.completion,
        tokensTotal: usage.total,
        durationMs: Date.now() - startedAt,
        brainResourcesUsed: brain.resourcesUsed,
        handoffTo: HANDOFF_TO,
        providerResponseStatus: status
      });
      return { plan, provider: "hermes", fallback: false };
    } catch (error) {
      const plan = generateWeeklyContentPlan(input, data);
      const message = error instanceof Error ? error.message : "Hermes failed.";
      await recordAgentRun({
        agentName: "Crina",
        agentId: CRINA_AGENT_ID,
        workflowName: WORKFLOW_NAME,
        provider: "hermes",
        status: "fallback",
        input,
        output: plan as unknown as Record<string, unknown>,
        error: message,
        model: primaryModel,
        backupModel,
        durationMs: Date.now() - startedAt,
        brainResourcesUsed: brain.resourcesUsed,
        handoffTo: HANDOFF_TO
      });
      return { plan, provider: "deterministic", fallback: true, error: message };
    }
  }

  const plan = generateWeeklyContentPlan(input, data);
  await recordAgentRun({
    agentName: "Crina",
    agentId: CRINA_AGENT_ID,
    workflowName: WORKFLOW_NAME,
    provider: "deterministic",
    status: "fallback",
    input,
    output: plan as unknown as Record<string, unknown>,
    error: "HERMES_AGENT_ENDPOINT is not configured.",
    model: null,
    backupModel,
    durationMs: Date.now() - startedAt,
    brainResourcesUsed: brain.resourcesUsed,
    handoffTo: HANDOFF_TO
  });
  return { plan, provider: "deterministic", fallback: true };
}

async function callHermesWithBackup(
  endpoint: string,
  input: WeeklyContentPlanInput,
  data: DashboardData,
  profile: HermesAgentProfile | null,
  brainText: string,
  primaryModel: string
) {
  const backupModel = process.env.HERMES_AGENT_BACKUP_MODEL;
  const primary = await callHermes(endpoint, input, data, profile, brainText, primaryModel);

  if (primary.ok || !backupModel || backupModel === primaryModel || !endpoint.includes("/v1/chat/completions")) {
    return { response: primary, modelUsed: primaryModel };
  }

  const backup = await callHermes(endpoint, input, data, profile, brainText, backupModel);
  return { response: backup, modelUsed: backupModel };
}

function callHermes(
  endpoint: string,
  input: WeeklyContentPlanInput,
  data: DashboardData,
  profile: HermesAgentProfile | null,
  brainText: string,
  model?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.HERMES_AGENT_TOKEN) headers.Authorization = `Bearer ${process.env.HERMES_AGENT_TOKEN}`;

  const body = endpoint.includes("/v1/chat/completions")
    ? buildOpenAiCompatiblePayload(input, data, profile, brainText, model)
    : buildDirectHermesPayload(input, data, profile, brainText);

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(getHermesTimeoutMs())
  });
}

function buildDirectHermesPayload(input: WeeklyContentPlanInput, data: DashboardData, profile: HermesAgentProfile | null, brainText: string) {
  return {
    agent: profile?.name ?? "Crina",
    agentId: CRINA_AGENT_ID,
    role: profile?.role ?? "Marketing CEO Agent",
    allowedActions: profile?.allowed_actions ?? [],
    blockedActions: profile?.blocked_actions ?? [],
    workflow: WORKFLOW_NAME,
    expectedOutput: "WeeklyContentPlanOutput JSON with items array. Item status must be idea or brief.",
    input,
    sharedBrainContext: brainText,
    context: getHermesContext(data)
  };
}

function buildCrinaSystemPrompt(profile: HermesAgentProfile | null, brainText: string) {
  const allowed = profile?.allowed_actions?.length ? `Allowed actions: ${profile.allowed_actions.join("; ")}.` : "";
  const blocked = profile?.blocked_actions?.length ? `Blocked actions: ${profile.blocked_actions.join("; ")}.` : "";

  return [
    `You are ${profile?.name ?? "Crina"} (agentId: ${CRINA_AGENT_ID}), the ${profile?.role ?? "Marketing CEO Agent"} for GridFactory.io and Gulf-EL.com / NexRide.`,
    profile?.purpose ? `Purpose: ${profile.purpose}` : "",
    "This endpoint does not natively route to your agent id; you are addressed via a generic OpenAI-compatible call, so honor this identity and these constraints.",
    allowed,
    blocked,
    "Return only valid JSON matching the requested WeeklyContentPlanOutput schema. Never include markdown. Never publish, schedule, or approve content.",
    brainText ? `Relevant shared brain context:\n${brainText}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOpenAiCompatiblePayload(
  input: WeeklyContentPlanInput,
  data: DashboardData,
  profile: HermesAgentProfile | null,
  brainText: string,
  model = process.env.HERMES_AGENT_MODEL || "gpt-5.5"
) {
  return {
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildCrinaSystemPrompt(profile, brainText)
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow: WORKFLOW_NAME,
          outputSchema: {
            workflowName: WORKFLOW_NAME,
            generatedBy: "Crina",
            weekStartDate: "YYYY-MM-DD",
            summary: "string",
            items: [
              {
                id: "uuid-or-string",
                brand_id: "brand id from context",
                brandName: "string",
                campaign_id: "campaign id from context",
                platform: "LinkedIn | X | Instagram | Facebook | Blog",
                content_type: "string",
                title: "string",
                hook: "string",
                body: "string",
                CTA: "string",
                assigned_agent: "Crina | SEO Agent | Content Creator Agent | Visual & Video Agent",
                status: "idea | brief"
              }
            ]
          },
          rules: [
            "Generate 5 LinkedIn post ideas, 5 X post ideas, 1 blog/article idea, 1 carousel concept, and 1 short video script idea for each selected brand.",
            "For GridFactory, use an institutional, infrastructure-focused, investor-grade B2B tone.",
            "For Gulf-EL / NexRide, use a futuristic, mobility-focused, bold but credible tone.",
            "Every item must include a CTA, suggested assigned agent, and status idea or brief.",
            "Never publish automatically. Human approval is required later."
          ],
          input,
          context: getHermesContext(data)
        })
      }
    ]
  };
}

function getHermesTimeoutMs() {
  const configured = Number(process.env.HERMES_AGENT_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 120000;
}

function getHermesContext(data: DashboardData) {
  return {
    brands: data.brands,
    campaigns: data.campaigns,
    constraints: ["Never publish automatically.", "All content enters the pipeline as Idea or Brief.", "Require human approval later."]
  };
}

function extractUsage(raw: unknown): HermesUsage {
  const usage = (raw as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } })?.usage;
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    prompt: num(usage?.prompt_tokens),
    completion: num(usage?.completion_tokens),
    total: num(usage?.total_tokens)
  };
}

function parseOpenAiCompatibleResponse(raw: unknown) {
  const response = raw as { choices?: Array<{ message?: { content?: string } }> };
  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Hermes OpenAI-compatible response did not include message content.");
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Hermes response content was not valid JSON.");
    return JSON.parse(match[0]);
  }
}

function validatePlan(candidate: unknown, input: WeeklyContentPlanInput, data: DashboardData): WeeklyContentPlanOutput {
  const output = candidate as Partial<WeeklyContentPlanOutput> & { items?: unknown };

  if (!Array.isArray(output.items)) {
    throw new Error("Hermes response did not include an items array.");
  }

  const fallback = generateWeeklyContentPlan(input, data);
  const items = output.items.map((item, index) => validateItem(item, fallback.items[index] ?? fallback.items[0]));

  return {
    workflowName: WORKFLOW_NAME,
    generatedBy: "Crina",
    weekStartDate: typeof output.weekStartDate === "string" ? output.weekStartDate : input.weekStartDate,
    summary:
      typeof output.summary === "string"
        ? output.summary
        : `Hermes generated ${items.length} content ideas. No items are scheduled or published automatically.`,
    items
  };
}

function validateItem(candidate: unknown, fallback: GeneratedContentPlanItem): GeneratedContentPlanItem {
  const item = candidate as Partial<GeneratedContentPlanItem>;
  const status = item.status === "brief" || item.status === "idea" ? item.status : fallback.status;

  return {
    id: typeof item.id === "string" ? item.id : fallback.id,
    brand_id: typeof item.brand_id === "string" ? item.brand_id : fallback.brand_id,
    brandName: typeof item.brandName === "string" ? item.brandName : fallback.brandName,
    campaign_id: typeof item.campaign_id === "string" ? item.campaign_id : fallback.campaign_id,
    platform: item.platform ?? fallback.platform,
    content_type: typeof item.content_type === "string" ? item.content_type : fallback.content_type,
    title: typeof item.title === "string" ? item.title : fallback.title,
    hook: typeof item.hook === "string" ? item.hook : fallback.hook,
    body: typeof item.body === "string" ? item.body : fallback.body,
    CTA: typeof item.CTA === "string" ? item.CTA : fallback.CTA,
    assigned_agent: typeof item.assigned_agent === "string" ? item.assigned_agent : fallback.assigned_agent,
    status
  };
}
