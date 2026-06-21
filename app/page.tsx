import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, LineChart, Megaphone, ShieldCheck } from "lucide-react";
import { Badge, PageHeader, Panel, StatCard } from "@/components/ui";
import { getAgentRuns, getDashboardData } from "@/lib/data";

const areas = [
  {
    href: "/marketing",
    title: "Marketing OS",
    eyebrow: "Live",
    description: "Crina, content pipeline, approvals, agent brain, Search Console analytics, and visual asset generation.",
    icon: Megaphone,
    tone: "green" as const
  },
  {
    href: "/trading",
    title: "Trading OS",
    eyebrow: "COMING SOON backend",
    description: "FX scanner, quant research lab, and risk governor UI wired to Hermes analysis endpoints. No broker execution.",
    icon: LineChart,
    tone: "amber" as const
  },
  {
    href: "/founder",
    title: "Founder Ops",
    eyebrow: "COMING SOON backend",
    description: "Founder daily brief, decision register, investor/commercial priorities, and cross-domain executive queue.",
    icon: BriefcaseBusiness,
    tone: "blue" as const
  }
];

export default async function HomePage() {
  const [data, runs] = await Promise.all([getDashboardData(), getAgentRuns(undefined, 50)]);
  const activeWork = data.contentItems.filter((item) => !["published", "analyzed"].includes(item.status)).length;
  const pendingApprovals = data.contentItems.filter((item) => item.approval_status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="Unified Control Tower"
        title="Agentic Operating System"
        description="One command center for marketing execution today, with Trading and Founder Ops surfaces prepared for Hermes-backed workflows."
        action={<Badge tone={process.env.HERMES_AGENT_ENDPOINT ? "green" : "amber"}>{process.env.HERMES_AGENT_ENDPOINT ? "Hermes configured" : "Hermes fallback"}</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Marketing brands" value={data.brands.length} detail="GridFactory + Gulf-EL / NexRide" />
        <StatCard label="Active work items" value={activeWork} detail="Marketing production and review queue" />
        <StatCard label="Pending approvals" value={pendingApprovals} detail="Human approval gates only" />
        <StatCard label="Agent runs" value={runs.length} detail="Recent Hermes / fallback runs" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {areas.map((area) => {
          const Icon = area.icon;
          return (
            <Link key={area.href} href={area.href} className="group block">
              <Panel className="h-full transition group-hover:-translate-y-0.5 group-hover:border-slate-300 dark:group-hover:border-slate-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge tone={area.tone}>{area.eyebrow}</Badge>
                </div>
                <h2 className="mt-5 text-xl font-semibold">{area.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{area.description}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-command">
                  Open workspace <ArrowRight className="h-4 w-4" />
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>

      <Panel className="mt-6 border-l-4 border-l-command">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-command" />
          <div>
            <h2 className="font-semibold">Execution rule</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Marketing can create drafts and visual assets, but live publishing remains blocked. Trading screens are research and risk review only; no broker orders are placed. Founder Ops produces briefs and decision support only.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
