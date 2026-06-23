import Link from "next/link";
import { BarChart3, CalendarDays, CheckCircle2, FileText, ImageIcon, Lightbulb, Megaphone, Route, Sparkles } from "lucide-react";
import { ModuleCard, OSBadge, OSMetric, OSPanel, PageHeading } from "@/components/os/ui";
import { MarketingResetAction } from "@/components/os/marketing-reset-action";
import { getAgentRuns, getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

const workflow = [
  { label: "Source", detail: "Objective, notes, content source", icon: FileText },
  { label: "Angles", detail: "Crina extracts campaign angles", icon: Lightbulb },
  { label: "Content", detail: "Platform-specific drafts", icon: Megaphone },
  { label: "Visuals", detail: "Carousel, image, video concepts", icon: ImageIcon },
  { label: "Calendar", detail: "7-day package and timing", icon: CalendarDays },
  { label: "Review", detail: "One final human approval", icon: CheckCircle2 },
  { label: "Improve", detail: "Analytics and feedback memory", icon: BarChart3 }
];

export default async function MarketingHome() {
  const [data, runs] = await Promise.all([getDashboardData(), getAgentRuns(undefined, 12)]);

  const draftCampaigns = data.campaigns.filter((campaign) => campaign.status === "planning").length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const pendingFinal = data.contentItems.filter((item) => item.approval_status === "pending").length;
  const readyDrafts = data.contentItems.filter((item) => item.status === "scheduled").length;
  const recentRuns = runs
    .filter((run) => run.agent_id?.includes("agent-") || run.workflow_name.toLowerCase().includes("seo") || run.workflow_name.toLowerCase().includes("campaign"))
    .slice(0, 4);

  const modules = [
    { href: "/marketing/campaigns", title: "Campaigns", description: "Create objectives, approve direction, and track campaign packages.", badge: "Start here" },
    { href: "/marketing/pipeline", title: "Pipeline", description: "See where each campaign is: Crina, SEO, content, visuals, review, or publishing prep.", badge: "Execution" },
    { href: "/marketing/ready-to-post", title: "Ready to Post", description: "Preview final packages with images, approve or send back, then copy/export manually.", badge: "Preview" },
    { href: "/marketing/approvals", title: "Approvals", description: "Direction approvals and legacy decision queue. Final packages live in Ready to Post.", badge: "Human gate" },
    { href: "/marketing/brands", title: "Brands", description: "Brand voice, pillars, SEO targets, CTAs, and approval rules for each project.", badge: "Context" },
    { href: "/marketing/agents", title: "Agents", description: "Crina and specialist agents with model, memory, run, and fallback status.", badge: "Brains" },
    { href: "/marketing/analytics", title: "Analytics", description: "Search Console learning plus clearly labelled sample panels until connectors are live.", badge: "Improve" }
  ];

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Campaign Command Center"
        subtitle="Create one campaign objective, let Crina orchestrate the agent loops, then approve one final package before publishing prep. Drafts only; nothing posts live."
        action={
          <Link
            href="/marketing/campaigns"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
          >
            <Sparkles className="h-4 w-4" />
            Create Campaign Objective
          </Link>
        }
      />

      <OSPanel className="mb-6 overflow-hidden border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.9),rgba(23,23,23,0.78))]">
        <div className="mb-5 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <OSBadge tone="info">Campaign-first automation</OSBadge>
              <OSBadge tone="warn">Final approval required</OSBadge>
              <OSBadge tone="off">No live posting</OSBadge>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-neutral-50">From one source to a weekly campaign engine</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
              The operator approves the direction. Crina handles the internal agent work: source, angles, posts, visuals, calendar, final review, and memory improvement.
            </p>
          </div>
          <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3 text-sm text-neutral-300">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Current mode</div>
            <div className="mt-1 font-medium text-neutral-100">Campaign packages, not isolated posts</div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {workflow.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.label} className="relative rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{index + 1}. {step.label}</div>
                </div>
                <p className="mt-3 text-sm leading-5 text-neutral-400">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </OSPanel>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OSMetric label="Draft objectives" value={draftCampaigns} hint="Campaigns waiting for direction" />
        <OSMetric label="In execution" value={activeCampaigns} hint="Crina-led campaign work" />
        <OSMetric label="Final approvals" value={pendingFinal} hint="Needs human decision" />
        <OSMetric label="Draft packages" value={readyDrafts} hint="Ready for publishing prep" />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <OSPanel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-50">Operator flow</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-400">Use Campaigns to start work. Use Pipeline to monitor agent ownership. Use Approvals only when the system needs a human decision.</p>
            </div>
            <Route className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <FlowBlock title="1. Approve direction" text="Brand, objective, source, audience, platforms, CTA." />
            <FlowBlock title="2. Let agents loop" text="Crina routes SEO, content, visual, and review internally." />
            <FlowBlock title="3. Approve package" text="One final pre-publish decision before draft prep." />
          </div>
        </OSPanel>

        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Recent agent signal</h2>
          <div className="mt-4 space-y-3">
            {recentRuns.length ? (
              recentRuns.map((run) => (
                <div key={run.id} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">{run.workflow_name}</div>
                      <div className="mt-1 truncate text-xs text-neutral-500">{run.agent_name} · {run.provider}{run.model ? ` · ${run.model}` : ""}</div>
                    </div>
                    <OSBadge tone={run.status === "success" ? "ok" : run.status === "fallback" ? "warn" : "danger"}>{run.status}</OSBadge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No recent marketing agent runs yet.</p>
            )}
          </div>
        </OSPanel>
      </div>

      <div className="mb-6">
        <MarketingResetAction />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <ModuleCard key={module.href} {...module} />
        ))}
      </div>
    </>
  );
}

function FlowBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="text-sm font-semibold text-neutral-100">{title}</div>
      <p className="mt-2 text-sm leading-6 text-neutral-400">{text}</p>
    </div>
  );
}
