import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { seedData } from "@/lib/seed";
import type { Activity, Approval, ApprovalDecision, Brand, Campaign, ContentItem, DashboardData } from "@/lib/types";

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
    return JSON.parse(raw) as DashboardData;
  } catch {
    return seedData;
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

function createActivity(label: string, detail: string): Activity {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    detail,
    timestamp: "Just now"
  };
}
