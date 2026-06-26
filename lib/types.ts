export type Brand = {
  id: string;
  name: string;
  website: string;
  positioning: string;
  target_audience: string;
  tone_of_voice: string;
  pillars?: string | null;
  content_pillars?: string | null;
  key_messages?: string | null;
  proof_points?: string | null;
  offers?: string | null;
  competitors?: string | null;
  seo_targets?: string | null;
  approval_rules?: string | null;
  ctas?: string | null;
  reusable_ctas?: string | null;
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

export type CampaignStatus = "idea" | "planning" | "active" | "paused" | "completed" | "archived";
export type CampaignAutomationStatus = "idle" | "running" | "paused" | "needs_attention" | "waiting_human" | "publishing_prep" | "complete";
export type CampaignAutomationMode = "human_gate" | "autopilot";

export type Campaign = {
  id: string;
  brand_id: string;
  title: string;
  objective: string;
  target_audience: string;
  status: CampaignStatus;
  start_date: string;
  end_date: string;
  created_at?: string;
  idea_brief?: Record<string, unknown> | null;
  selected_at?: string | null;
  archived_at?: string | null;
  automation_status?: CampaignAutomationStatus | null;
  automation_mode?: CampaignAutomationMode | null;
  automation_locked_until?: string | null;
  automation_running?: boolean | null;
  automation_lease_until?: string | null;
  automation_last_tick_at?: string | null;
  automation_error?: string | null;
  automation_no_progress_count?: number | null;
  automation_started_at?: string | null;
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
export type ContentWorkflowStage =
  | "crina_plan_approval"
  | "content_creation"
  | "crina_content_review"
  | "visual_creation"
  | "crina_final_review"
  | "human_final_approval"
  | "publishing_prep"
  | "scheduled"
  | "rework"
  | "done";

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
  visual_asset_url?: string | null;
  visual_asset_prompt?: string | null;
  visual_asset_status?: "not_requested" | "generated" | "placeholder" | "error" | null;
  visual_asset_model?: string | null;
  visual_asset_error?: string | null;
  notified_at?: string | null;
  workflow_stage?: ContentWorkflowStage | null;
  current_owner?: string | null;
  next_owner?: string | null;
  human_feedback_tags?: string[] | null;
  crina_review_notes?: string | null;
  agent_handoff_summary?: string | null;
  loop_iteration?: number | null;
  ready_package?: ReadyPackage | null;
};

export type ReadyPackageAsset = {
  kind: "image" | "carousel_slide" | "cover_frame" | "video_placeholder";
  url?: string | null;
  prompt?: string | null;
  position?: number;
  model?: string | null;
  provider?: string | null;
  status?: "generated" | "placeholder" | "error";
  error?: string | null;
};

export type ReadyPackage = {
  platform: string;
  content_type: string;
  text: string;
  title?: string;
  meta_description?: string;
  body?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  alt_text?: string;
  suggested_post_time?: string;
  asset_checklist?: string[];
  script?: string;
  storyboard?: string[];
  video_status?: "coming_soon" | "draft_asset";
  provider?: string;
  model?: string | null;
  fallback_used?: boolean;
  assets?: ReadyPackageAsset[];
};

export type ContentAsset = {
  id: string;
  content_item_id: string;
  kind: ReadyPackageAsset["kind"];
  url: string | null;
  prompt: string | null;
  position: number;
  model: string | null;
  provider?: string | null;
  status: "generated" | "placeholder" | "error";
  error: string | null;
  created_at?: string;
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

export type IntegrationProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "hermes"
  | "n8n"
  | "telegram"
  | "linkedin"
  | "x"
  | "tiktok"
  | "youtube"
  | "instagram"
  | "facebook"
  | "google-search-console"
  | "ga4";

export type IntegrationStatus = "not_configured" | "configured" | "connected" | "error" | "testable";

export type IntegrationConfig = {
  id: string;
  provider: IntegrationProvider;
  display_name: string;
  status: IntegrationStatus;
  metadata: Record<string, string>;
  configured: boolean;
  last_checked_at: string | null;
};

export type AgentRunStatus = "success" | "fallback" | "error" | "rate_limited";

export type AgentRun = {
  id: string;
  agent_name: string;
  workflow_name: string;
  provider: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  // Observability fields. All nullable because Hermes may not return usage yet.
  agent_id?: string | null;
  model?: string | null;
  backup_model?: string | null;
  tokens_prompt?: number | null;
  tokens_completion?: number | null;
  tokens_total?: number | null;
  duration_ms?: number | null;
  brain_resources_used?: string[] | null;
  handoff_from?: string | null;
  handoff_to?: string | null;
  provider_response_status?: number | null;
};

export type AgentSetting = {
  agent_id: string;
  model: string | null;
  enabled: boolean;
  updated_at?: string;
};

export type AgentConfig = {
  id?: string;
  agent_id: string;
  provider: string;
  model: string;
  updated_at?: string;
  updated_by?: string | null;
};

export type AgentTargetType = "competitor" | "topic" | "platform" | "brand";

export type AgentTarget = {
  id: string;
  label: string;
  type: AgentTargetType;
  active: boolean;
  notes: string;
  created_at?: string;
};

export type AgentSignalSeverity = "info" | "warning" | "critical";
export type AgentSignalStatus = "open" | "ack" | "resolved" | "needs_approval";

export type AgentSignal = {
  id: string;
  agent_id: string;
  agent_name: string;
  kind: string;
  severity: AgentSignalSeverity;
  message: string;
  status: AgentSignalStatus;
  run_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

export type AgentLearningEvent = {
  id: string;
  content_item_id: string | null;
  brand_id: string | null;
  agent_id: string | null;
  agent_name: string;
  decision: string;
  feedback: string;
  tags: string[];
  summary: string;
  created_at: string;
};

export type ModelRegistryEntry = {
  id: string;
  name: string;
  provider: string;
  notes: string;
  enabled: boolean;
  created_at?: string;
};

export type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscResult = {
  connected: boolean;
  site: string | null;
  range?: { start: string; end: string };
  rows: GscRow[];
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
  reason?: string;
};

export type DashboardData = {
  brands: Brand[];
  agents: Agent[];
  campaigns: Campaign[];
  contentItems: ContentItem[];
  approvals: Approval[];
  activity: Activity[];
  integrationConfigs?: IntegrationConfig[];
  agentRuns?: AgentRun[];
  agentConfigs?: AgentConfig[];
  agentSettings?: AgentSetting[];
  agentTargets?: AgentTarget[];
  agentSignals?: AgentSignal[];
  agentLearningEvents?: AgentLearningEvent[];
  modelRegistry?: ModelRegistryEntry[];
};

export type WeeklyContentPlanBrandSelection = "gridfactory" | "gulf-el" | "both";
export type WeeklyContentIntensity = "light" | "normal" | "aggressive";
export type WeeklyContentPlatform = "LinkedIn" | "X" | "Instagram" | "Facebook" | "TikTok" | "YouTube" | "Blog";

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
