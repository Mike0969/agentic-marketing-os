import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { seedData } from "@/lib/seed";
import type {
  Activity,
  AgentRun,
  AgentSetting,
  AgentSignal,
  AgentSignalStatus,
  AgentTarget,
  Approval,
  ApprovalDecision,
  Brand,
  Campaign,
  ContentItem,
  DashboardData,
  IntegrationConfig,
  IntegrationProvider,
  ModelRegistryEntry
} from "@/lib/types";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "local-dashboard.json");

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(seedData, null, 2));
  }
}

export async function readLocalDashboardData(): Promise<DashboardData> {
  await ensureDataFile();

  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as DashboardData;
    return withDefaults(parsed);
  } catch {
    return withDefaults(seedData);
  }
}

export async function appendLocalContentItems(items: ContentItem[]) {
  const data = await readLocalDashboardData();
  const existingIds = new Set(data.contentItems.map((item) => item.id));
  const newItems = items.filter((item) => !existingIds.has(item.id));

  const nextData: DashboardData = {
    ...data,
    contentItems: [...newItems, ...data.contentItems],
    activity: [createActivity("Crina created content ideas", `${newItems.length} weekly content plan items entered the pipeline as Idea or Brief.`), ...data.activity]
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));

  return newItems;
}

export async function updateLocalContentItem(id: string, patch: Partial<ContentItem>, activityLabel?: string, activityDetail?: string) {
  const data = await readLocalDashboardData();
  const existing = data.contentItems.find((item) => item.id === id);
  if (!existing) return null;

  const updated: ContentItem = { ...existing, ...patch, id };
  const nextData: DashboardData = {
    ...data,
    contentItems: data.contentItems.map((item) => (item.id === id ? updated : item)),
    activity: activityLabel ? [createActivity(activityLabel, activityDetail ?? ""), ...data.activity] : data.activity
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));
  return updated;
}

export async function updateLocalBrand(id: string, patch: Partial<Brand>) {
  const data = await readLocalDashboardData();
  const existing = data.brands.find((brand) => brand.id === id);

  if (!existing) {
    return null;
  }

  const updated = { ...existing, ...patch, id };
  const nextData: DashboardData = {
    ...data,
    brands: data.brands.map((brand) => (brand.id === id ? updated : brand)),
    activity: [createActivity("Brand profile updated", `${updated.name} strategic profile was saved.`), ...data.activity]
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));
  return updated;
}

export async function createLocalCampaign(input: Omit<Campaign, "id" | "status">) {
  const data = await readLocalDashboardData();
  const campaign: Campaign = {
    id: `campaign-${Date.now()}`,
    status: "planning",
    ...input
  };

  const brand = data.brands.find((item) => item.id === campaign.brand_id);
  const nextData: DashboardData = {
    ...data,
    campaigns: [campaign, ...data.campaigns],
    activity: [createActivity("Campaign created", `${campaign.title} was created for ${brand?.name ?? "a brand"}.`), ...data.activity]
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));
  return campaign;
}

export async function decideLocalApproval(input: {
  contentItemId: string;
  decision: Exclude<ApprovalDecision, "pending">;
  feedback: string;
  requestedByAgent: string;
}) {
  const data = await readLocalDashboardData();
  const decidedAt = new Date().toISOString();
  const nextContentStatus = input.decision === "approved" ? "scheduled" : "draft";
  const contentItem = data.contentItems.find((item) => item.id === input.contentItemId);

  if (!contentItem) {
    return null;
  }

  const updatedContentItem: ContentItem = {
    ...contentItem,
    approval_status: input.decision,
    status: nextContentStatus
  };
  const existingApproval = data.approvals.find((approval) => approval.content_item_id === input.contentItemId);
  const approval: Approval = {
    id: existingApproval?.id ?? `approval-${input.contentItemId}`,
    content_item_id: input.contentItemId,
    requested_by_agent: input.requestedByAgent,
    decision: input.decision,
    feedback: input.feedback,
    decided_at: decidedAt
  };

  const approvals = existingApproval
    ? data.approvals.map((item) => (item.id === existingApproval.id ? approval : item))
    : [approval, ...data.approvals];

  const nextData: DashboardData = {
    ...data,
    contentItems: data.contentItems.map((item) => (item.id === input.contentItemId ? updatedContentItem : item)),
    approvals,
    activity: [createActivity("Approval decision recorded", `${updatedContentItem.title} was marked ${input.decision.replaceAll("_", " ")}.`), ...data.activity]
  };

  await writeFile(dataFile, JSON.stringify(nextData, null, 2));
  return { contentItem: updatedContentItem, approval };
}

export async function readLocalIntegrations() {
  const data = await readLocalDashboardData();
  return data.integrationConfigs ?? [];
}

export async function upsertLocalIntegration(input: {
  provider: IntegrationProvider;
  displayName: string;
  metadata: Record<string, string>;
  hasSecret: boolean;
}) {
  const data = await readLocalDashboardData();
  const existing = data.integrationConfigs?.find((item) => item.provider === input.provider);
  const next: IntegrationConfig = {
    id: existing?.id ?? `integration-${input.provider}`,
    provider: input.provider,
    display_name: input.displayName,
    status: input.hasSecret || existing?.configured ? "configured" : "not_configured",
    metadata: input.metadata,
    configured: input.hasSecret || existing?.configured || false,
    last_checked_at: existing?.last_checked_at ?? null
  };

  const nextConfigs = existing
    ? (data.integrationConfigs ?? []).map((item) => (item.provider === input.provider ? next : item))
    : [next, ...(data.integrationConfigs ?? [])];

  await writeFile(
    dataFile,
    JSON.stringify(
      {
        ...data,
        integrationConfigs: nextConfigs,
        activity: [createActivity("Integration settings updated", `${input.displayName} connection metadata was saved.`), ...data.activity]
      },
      null,
      2
    )
  );

  return next;
}

export async function markLocalIntegrationTested(provider: IntegrationProvider, status: IntegrationConfig["status"]) {
  const data = await readLocalDashboardData();
  const configs = data.integrationConfigs ?? [];
  const existing = configs.find((item) => item.provider === provider);

  if (!existing) {
    return null;
  }

  const updated = { ...existing, status, last_checked_at: new Date().toISOString() };
  await writeFile(
    dataFile,
    JSON.stringify(
      {
        ...data,
        integrationConfigs: configs.map((item) => (item.provider === provider ? updated : item)),
        activity: [createActivity("Integration test completed", `${existing.display_name} returned ${status}.`), ...data.activity]
      },
      null,
      2
    )
  );

  return updated;
}

export async function appendLocalAgentRun(run: Omit<AgentRun, "id" | "created_at">) {
  const data = await readLocalDashboardData();
  const agentRun: AgentRun = {
    id: `agent-run-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    ...run
  };

  await writeFile(
    dataFile,
    JSON.stringify(
      {
        ...data,
        agentRuns: [agentRun, ...(data.agentRuns ?? [])],
        activity:
          run.status === "fallback"
            ? [createActivity("Crina used deterministic fallback", run.error ?? "Hermes is unavailable, so deterministic planning was used."), ...data.activity]
            : data.activity
      },
      null,
      2
    )
  );
  return agentRun;
}

function createActivity(label: string, detail: string): Activity {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    detail,
    timestamp: "Just now"
  };
}

function withDefaults(data: DashboardData): DashboardData {
  return {
    ...data,
    integrationConfigs: data.integrationConfigs ?? [],
    agentRuns: data.agentRuns ?? [],
    agentSettings: data.agentSettings ?? [],
    agentTargets: data.agentTargets ?? [],
    agentSignals: data.agentSignals ?? [],
    modelRegistry: data.modelRegistry ?? []
  };
}

export async function readLocalAgentSignals() {
  const data = await readLocalDashboardData();
  return data.agentSignals ?? [];
}

export async function appendLocalAgentSignal(signal: Omit<AgentSignal, "id" | "created_at">) {
  const data = await readLocalDashboardData();
  const entry: AgentSignal = {
    id: `signal-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    ...signal
  };
  await writeFile(dataFile, JSON.stringify({ ...data, agentSignals: [entry, ...(data.agentSignals ?? [])] }, null, 2));
  return entry;
}

export async function updateLocalAgentSignal(id: string, status: AgentSignalStatus) {
  const data = await readLocalDashboardData();
  const signals = data.agentSignals ?? [];
  const existing = signals.find((item) => item.id === id);
  if (!existing) return null;
  const updated: AgentSignal = { ...existing, status, resolved_at: status === "resolved" ? new Date().toISOString() : existing.resolved_at ?? null };
  await writeFile(dataFile, JSON.stringify({ ...data, agentSignals: signals.map((item) => (item.id === id ? updated : item)) }, null, 2));
  return updated;
}

export async function readLocalModelRegistry() {
  const data = await readLocalDashboardData();
  return data.modelRegistry ?? [];
}

export async function addLocalModel(input: { name: string; provider: string; notes?: string }) {
  const data = await readLocalDashboardData();
  const entry: ModelRegistryEntry = {
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: input.name,
    provider: input.provider,
    notes: input.notes ?? "",
    enabled: true,
    created_at: new Date().toISOString()
  };
  await writeFile(dataFile, JSON.stringify({ ...data, modelRegistry: [entry, ...(data.modelRegistry ?? [])] }, null, 2));
  return entry;
}

export async function removeLocalModel(id: string) {
  const data = await readLocalDashboardData();
  const registry = data.modelRegistry ?? [];
  await writeFile(dataFile, JSON.stringify({ ...data, modelRegistry: registry.filter((item) => item.id !== id) }, null, 2));
  return true;
}

export async function readLocalAgentSettings() {
  const data = await readLocalDashboardData();
  return data.agentSettings ?? [];
}

export async function upsertLocalAgentSetting(setting: { agent_id: string; model: string | null; enabled?: boolean }) {
  const data = await readLocalDashboardData();
  const settings = data.agentSettings ?? [];
  const existing = settings.find((item) => item.agent_id === setting.agent_id);
  const next: AgentSetting = {
    agent_id: setting.agent_id,
    model: setting.model,
    enabled: setting.enabled ?? existing?.enabled ?? true,
    updated_at: new Date().toISOString()
  };
  const nextSettings = existing
    ? settings.map((item) => (item.agent_id === setting.agent_id ? next : item))
    : [next, ...settings];
  await writeFile(dataFile, JSON.stringify({ ...data, agentSettings: nextSettings }, null, 2));
  return next;
}

export async function readLocalAgentTargets() {
  const data = await readLocalDashboardData();
  return data.agentTargets ?? [];
}

export async function addLocalAgentTarget(input: { label: string; type: AgentTarget["type"]; notes?: string }) {
  const data = await readLocalDashboardData();
  const targets = data.agentTargets ?? [];
  const target: AgentTarget = {
    id: `target-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: input.label,
    type: input.type,
    active: true,
    notes: input.notes ?? "",
    created_at: new Date().toISOString()
  };
  await writeFile(dataFile, JSON.stringify({ ...data, agentTargets: [target, ...targets] }, null, 2));
  return target;
}

export async function updateLocalAgentTarget(id: string, patch: Partial<Pick<AgentTarget, "active" | "label" | "notes" | "type">>) {
  const data = await readLocalDashboardData();
  const targets = data.agentTargets ?? [];
  const existing = targets.find((item) => item.id === id);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id };
  await writeFile(dataFile, JSON.stringify({ ...data, agentTargets: targets.map((item) => (item.id === id ? updated : item)) }, null, 2));
  return updated;
}

export async function removeLocalAgentTarget(id: string) {
  const data = await readLocalDashboardData();
  const targets = data.agentTargets ?? [];
  await writeFile(dataFile, JSON.stringify({ ...data, agentTargets: targets.filter((item) => item.id !== id) }, null, 2));
  return true;
}
