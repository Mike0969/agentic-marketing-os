import { BriefcaseBusiness, CalendarClock, CheckSquare, CircleAlert, MessageSquareText } from "lucide-react";
import { OsWorkflowRunner } from "@/components/os-workflow-runner";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { getDashboardData } from "@/lib/data";

const founderQueues = [
  { label: "Marketing approvals", detail: "Review finished Crina packages before Publishing prepares drafts.", status: "Live" },
  { label: "Trading data provider", detail: "Choose read-only market/broker data path before any strategy validation.", status: "COMING SOON" },
  { label: "Deployment readiness", detail: "Confirm server-only secrets, Supabase migrations, and Vercel target.", status: "Open" },
  { label: "Advisor handoff", detail: "Package current state, risks, and next implementation prompt.", status: "Open" }
];

export default async function FounderPage() {
  const data = await getDashboardData();
  const approvalCount = data.contentItems.filter((item) => item.approval_status === "pending").length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === "active").length;

  return (
    <>
      <PageHeader
        eyebrow="Founder Ops"
        title="Founder Operating Desk"
        description="Executive control surface for decisions, blockers, priorities, and cross-domain agent outputs. Calendar, email, CRM, and advisor sharing are COMING SOON."
        action={<Badge tone="amber">COMING SOON automations</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Marketing approvals" value={approvalCount} detail="Needs founder/human decision" />
        <StatCard label="Active campaigns" value={activeCampaigns} detail="Marketing execution track" />
        <StatCard label="Trading mode" value="Research" detail="No broker execution" />
        <StatCard label="Founder automations" value="COMING SOON" detail="Calendar, CRM, inbox" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <BriefcaseBusiness className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Founder Queue</h2>
          </div>
          <div className="space-y-3">
            {founderQueues.map((item) => (
              <div key={item.label} className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.label}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
                  </div>
                  <Badge tone={item.status === "Live" ? "green" : item.status === "Open" ? "blue" : "amber"}>{item.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <OsWorkflowRunner
          workflow="founder-brief"
          buttonLabel="Generate founder brief"
          defaultInput={{ marketingApprovals: approvalCount, activeCampaigns, tradingMode: "research-only" }}
          notePlaceholder="Paste founder priorities, advisor requests, blockers, or investor context..."
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Decision Register</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <div className="font-semibold">Choose first production deployment target</div>
              <div className="mt-1 text-slate-500">Recommended: Vercel + Supabase before dedicated infrastructure.</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-950">
              <div className="font-semibold">Choose first real non-marketing connector</div>
              <div className="mt-1 text-slate-500">Recommended: read-only market data before broker execution.</div>
            </div>
          </div>
        </Panel>

        <OsWorkflowRunner
          workflow="founder-decisions"
          buttonLabel="Structure decisions"
          defaultInput={{ decisionContext: founderQueues, operatingMode: "human-in-the-loop" }}
          notePlaceholder="Paste messy decisions here; Hermes will structure options and dependencies..."
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Calendar</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">COMING SOON: meeting ingestion, reminders, and daily executive schedule.</p>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Advisor Updates</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">COMING SOON: advisor-safe summary generation and shareable weekly packet.</p>
        </Panel>
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <CircleAlert className="h-4 w-4 text-command" />
            <h2 className="font-semibold">Escalations</h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">COMING SOON: cross-agent escalations from Marketing, Trading, and Founder Ops into one priority inbox.</p>
        </Panel>
      </div>
    </>
  );
}
