import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardCheck, Lightbulb, ListChecks, Sparkles, Workflow } from "lucide-react";
import { OSBadge, OSPanel, PageHeading } from "@/components/os/ui";
import { MarketingResetAction } from "@/components/os/marketing-reset-action";
import { getAgentRuns, getDashboardData } from "@/lib/data";
import { FLOW_STEPS, flowView, isSimpleFlow } from "@/lib/marketing/flow-view";

export const dynamic = "force-dynamic";

// Mihai 2026-11-20: "My idea is simple" — one main path; everything else under More.
const mainPath = [
  { step: 1, href: "/marketing/new", title: "Your idea", detail: "Write it in one form, plus platforms and dates if you want.", icon: Lightbulb },
  { step: 2, href: "/marketing/review", title: "Crina plans · Jev checks", detail: "Crina builds the plan; Jev checks it before any agent starts.", icon: ListChecks },
  { step: 3, href: "/marketing/pipeline", title: "Agents work", detail: "Content, visual, SEO and analytics. Watch it in Pipeline.", icon: Workflow },
  { step: 4, href: "/marketing/review", title: "Your review", detail: "One screen per campaign: Yes or Rework on each part.", icon: ClipboardCheck },
  { step: 5, href: "/marketing/schedule", title: "Schedule", detail: "All Yes → it goes to the schedule for posting.", icon: CalendarClock }
];

const more = [
  { href: "/marketing/campaigns", title: "All campaigns", description: "Every campaign, including the older idea board." },
  { href: "/marketing/approvals", title: "Approvals (legacy queue)", description: "The older decision queue." },
  { href: "/marketing/ready-to-post", title: "Ready to Post", description: "Final packages, copy/export." },
  { href: "/marketing/assets", title: "Assets", description: "Images, video, carousels, decks." },
  { href: "/marketing/analytics", title: "Analytics", description: "Search Console and sample panels." },
  { href: "/marketing/brands", title: "Brands", description: "Brand voice, pillars, CTAs, rules." },
  { href: "/marketing/agents", title: "Agents", description: "Models, memory and run status." }
];

export default async function MarketingHome() {
  const [data, runs] = await Promise.all([getDashboardData(), getAgentRuns(undefined, 12)]);

  const draftCampaigns = data.campaigns.filter((campaign) => campaign.status === "planning").length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;
  const pendingFinal = data.contentItems.filter((item) => item.approval_status === "pending").length;
  const readyDrafts = data.contentItems.filter((item) => item.status === "scheduled").length;
  const views = data.campaigns.filter(isSimpleFlow).map((campaign) => flowView(campaign, data.contentItems));
  const recentRuns = runs.slice(0, 4);

  const kpis = [
    { label: "Draft objectives", value: draftCampaigns, hint: "Campaigns still being planned", href: "/marketing/campaigns?status=planning" },
    { label: "In execution", value: activeCampaigns, hint: "Agents at work: open Pipeline", href: "/marketing/pipeline" },
    { label: "Final approvals", value: pendingFinal, hint: "Posts waiting for your Yes / Rework", href: "/marketing/review" },
    { label: "Draft packages", value: readyDrafts, hint: "Approved and in the schedule", href: "/marketing/schedule" }
  ];

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Marketing"
        subtitle="Write an idea; Crina plans it, Jev checks, the agents make the posts, you say Yes or Rework. Nothing posts live from the test copy."
        action={
          <Link href="/marketing/new" className="inline-flex items-center justify-center gap-2 rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15">
            <Sparkles className="h-4 w-4" />
            New campaign
          </Link>
        }
      />

      <OSPanel className="mb-6 border-cyan-500/20">
        <h2 className="text-lg font-semibold text-neutral-50">Operator flow</h2>
        <p className="mt-1 text-sm text-neutral-400">Your main path. Click a step to open it.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {mainPath.map((step) => {
            const Icon = step.icon;
            return (
              <Link key={step.step} href={step.href} className="group rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-cyan-400/50 hover:bg-neutral-900">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  <Icon className="h-4 w-4" />
                  {step.step}. {step.title}
                </div>
                <p className="mt-2 text-sm leading-5 text-neutral-400">{step.detail}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm text-neutral-300 group-hover:text-neutral-50">
                  Open <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </OSPanel>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="group block">
            <OSPanel className="h-full transition group-hover:border-neutral-600">
              <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-neutral-500">
                {kpi.label}
                <ArrowRight className="h-4 w-4 text-neutral-600 group-hover:text-neutral-200" />
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-neutral-50">{kpi.value}</div>
              <div className="mt-1 text-sm text-neutral-400">{kpi.hint}</div>
            </OSPanel>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Your campaigns</h2>
          <div className="mt-4 space-y-2">
            {views.length ? (
              views.slice(0, 8).map((view) => (
                <Link key={view.campaign.id} href={`/marketing/review/${view.campaign.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3 hover:border-neutral-700">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{view.campaign.title}</div>
                    <div className="mt-1 text-xs text-neutral-400">{view.label}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {FLOW_STEPS.map((step) => (
                      <span key={step.step} title={step.label} className={`h-2 w-6 rounded-full ${step.step < view.step ? "bg-cyan-400/70" : step.step === view.step ? (view.needsMihai ? "bg-amber-400" : "bg-cyan-300") : "bg-neutral-800"}`} />
                    ))}
                    {view.needsMihai ? <OSBadge tone="warn">Needs you</OSBadge> : null}
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No campaigns yet. <Link className="text-cyan-300 underline" href="/marketing/new">Start with your idea.</Link></p>
            )}
          </div>
        </OSPanel>

        <OSPanel>
          <h2 className="text-lg font-semibold text-neutral-50">Recent agent work</h2>
          <div className="mt-4 space-y-2">
            {recentRuns.length ? (
              recentRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-100">{run.workflow_name}</div>
                    <div className="mt-1 truncate text-xs text-neutral-500">{run.agent_name}</div>
                  </div>
                  <OSBadge tone={run.status === "success" ? "ok" : run.status === "error" ? "danger" : "warn"}>{run.status.replace("_", " ")}</OSBadge>
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No agent runs yet.</p>
            )}
          </div>
        </OSPanel>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">More</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {more.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 hover:border-neutral-700 hover:bg-neutral-900">
              <div className="text-sm font-medium text-neutral-200">{item.title}</div>
              <div className="text-xs text-neutral-500">{item.description}</div>
            </Link>
          ))}
        </div>
        <div className="mt-4">
          <MarketingResetAction />
        </div>
      </section>
    </>
  );
}
