export type Brand = {
  id: string;
  name: string;
  website: string;
  positioning: string;
  target_audience: string;
  tone_of_voice: string;
  active: boolean;
};

export type AgentStatus = "active" | "standby" | "paused";

export type Agent = {
  id: string;
  name: string;
  role: string;
  description: string;
  model_preference: string;
  status: AgentStatus;
  brand_scope: string;
};

export type CampaignStatus = "planning" | "active" | "paused" | "completed";

export type Campaign = {
  id: string;
  brand_id: string;
  title: string;
  objective: string;
  target_audience: string;
  status: CampaignStatus;
  start_date: string;
  end_date: string;
};

export const contentStatuses = [
  "idea",
  "brief",
  "draft",
  "visual",
  "approval",
  "scheduled",
  "published",
  "analyzed"
] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type ApprovalStatus = "not_requested" | "pending" | "approved" | "rejected" | "changes_requested";

export type ContentItem = {
  id: string;
  brand_id: string;
  campaign_id: string;
  platform: string;
  content_type: string;
  title: string;
  body: string;
  hook: string;
  CTA: string;
  status: ContentStatus;
  assigned_agent: string;
  approval_status: ApprovalStatus;
  scheduled_at: string | null;
  published_at: string | null;
  performance_summary: string | null;
};

export type ApprovalDecision = "pending" | "approved" | "rejected" | "changes_requested";

export type Approval = {
  id: string;
  content_item_id: string;
  requested_by_agent: string;
  decision: ApprovalDecision;
  feedback: string;
  decided_at: string | null;
};

export type Activity = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
};

export type DashboardData = {
  brands: Brand[];
  agents: Agent[];
  campaigns: Campaign[];
  contentItems: ContentItem[];
  approvals: Approval[];
  activity: Activity[];
};

export type WeeklyContentPlanBrandSelection = "gridfactory" | "gulf-el" | "both";
export type WeeklyContentIntensity = "light" | "normal" | "aggressive";
export type WeeklyContentPlatform = "LinkedIn" | "X" | "Instagram" | "Facebook" | "Blog";

export type WeeklyContentPlanInput = {
  brand: WeeklyContentPlanBrandSelection;
  campaignObjective: string;
  targetAudience: string;
  weekStartDate: string;
  platforms: WeeklyContentPlatform[];
  contentIntensity: WeeklyContentIntensity;
  humanNotes: string;
};

export type GeneratedContentPlanItem = {
  id: string;
  brand_id: string;
  brandName: string;
  campaign_id: string;
  platform: WeeklyContentPlatform;
  content_type: string;
  title: string;
  hook: string;
  body: string;
  CTA: string;
  assigned_agent: string;
  status: Extract<ContentStatus, "idea" | "brief">;
};

export type WeeklyContentPlanOutput = {
  workflowName: "Generate Weekly Content Plan";
  generatedBy: "Crina";
  weekStartDate: string;
  summary: string;
  items: GeneratedContentPlanItem[];
};
