import { generateWeeklyContentPlan } from "@/lib/workflows/weekly-content-plan";
import { makeActivity } from "@/lib/activity";
import { listIntegrationConfigs } from "@/lib/integration-store";
import { appendLocalAgentRun } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { DashboardData, GeneratedContentPlanItem, WeeklyContentPlanInput, WeeklyContentPlanOutput } from "@/lib/types";

export async function runCrinaWeeklyContentPlan(input: WeeklyContentPlanInput, data: DashboardData) {
  const endpoint = await resolveHermesEndpoint();

  if (endpoint) {
    try {
      const response = await callHermesWithBackup(endpoint, input, data);

      if (!response.ok) {
        throw new Error(`Hermes returned HTTP ${response.status}`);
      }

      const raw = (await response.json()) as unknown;
      const candidate = endpoint.includes("/v1/chat/completions") ? parseOpenAiCompatibleResponse(raw) : raw;
      const plan = validatePlan(candidate, input, data);
      await recordAgentRun({ provider: "hermes", status: "success", input, output: plan, error: null });
      return { plan, provider: "hermes", fallback: false };
    } catch (error) {
      const plan = generateWeeklyContentPlan(input, data);
      const message = error instanceof Error ? error.message : "Hermes failed.";
      await recordAgentRun({ provider: "hermes", status: "fallback", input, output: plan, error: message });
      return { plan, provider: "deterministic", fallback: true, error: message };
    }
  }

  const plan = generateWeeklyContentPlan(input, data);
  await recordAgentRun({ provider: "deterministic", status: "fallback", input, output: plan, error: "HERMES_AGENT_ENDPOINT is not configured." });
  return { plan, provider: "deterministic", fallback: true };
}

async function callHermesWithBackup(endpoint: string, input: WeeklyContentPlanInput, data: DashboardData) {
  const primaryModel = process.env.HERMES_AGENT_MODEL || "gpt-5.5";
  const backupModel = process.env.HERMES_AGENT_BACKUP_MODEL;
  const primary = await callHermes(endpoint, input, data, primaryModel);

  if (primary.ok || !backupModel || backupModel === primaryModel || !endpoint.includes("/v1/chat/completions")) {
    return primary;
  }

  return callHermes(endpoint, input, data, backupModel);
}

function callHermes(endpoint: string, input: WeeklyContentPlanInput, data: DashboardData, model?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.HERMES_AGENT_TOKEN) headers.Authorization = `Bearer ${process.env.HERMES_AGENT_TOKEN}`;

  const body = endpoint.includes("/v1/chat/completions")
    ? buildOpenAiCompatiblePayload(input, data, model)
    : buildDirectHermesPayload(input, data);

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(getHermesTimeoutMs())
  });
}

function buildDirectHermesPayload(input: WeeklyContentPlanInput, data: DashboardData) {
  return {
    agent: "Crina",
    agentId: "agent-crina",
    workflow: "Generate Weekly Content Plan",
    expectedOutput: "WeeklyContentPlanOutput JSON with items array. Item status must be idea or brief.",
    input,
    context: getHermesContext(data)
  };
}

function buildOpenAiCompatiblePayload(input: WeeklyContentPlanInput, data: DashboardData, model = process.env.HERMES_AGENT_MODEL || "gpt-5.5") {
  return {
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Crina, the Marketing CEO Agent for GridFactory.io and Gulf-EL.com / NexRide. Return only valid JSON matching the requested WeeklyContentPlanOutput schema. Never include markdown. Never publish, schedule, or approve content."
      },
      {
        role: "user",
        content: JSON.stringify({
          workflow: "Generate Weekly Content Plan",
          outputSchema: {
            workflowName: "Generate Weekly Content Plan",
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
    workflowName: "Generate Weekly Content Plan",
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

async function recordAgentRun(input: {
  provider: string;
  status: "success" | "fallback" | "error";
  input: WeeklyContentPlanInput;
  output: WeeklyContentPlanOutput;
  error: string | null;
}) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      await supabase.from("agent_runs").insert({
        agent_name: "Crina",
        workflow_name: "Generate Weekly Content Plan",
        provider: input.provider,
        status: input.status,
        input: input.input,
        output: input.output,
        error: input.error
      });
      if (input.status === "fallback") {
        await supabase
          .from("activity")
          .insert(makeActivity("Crina used deterministic fallback", input.error ?? "Hermes is unavailable, so deterministic planning was used."));
      }
      return;
    }
  }

  await appendLocalAgentRun({
    agent_name: "Crina",
    workflow_name: "Generate Weekly Content Plan",
    provider: input.provider,
    status: input.status,
    input: input.input as unknown as Record<string, unknown>,
    output: input.output as unknown as Record<string, unknown>,
    error: input.error
  });
}

async function resolveHermesEndpoint() {
  if (process.env.HERMES_AGENT_ENDPOINT) return process.env.HERMES_AGENT_ENDPOINT;

  const integrations = await listIntegrationConfigs();
  const hermes = integrations.find((integration) => integration.provider === "hermes");
  return hermes?.metadata?.endpoint || null;
}
