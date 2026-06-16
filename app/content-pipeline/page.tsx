import { ApprovalStatusBadge } from "@/components/status";
import { PageHeader } from "@/components/ui";
import { byId, getDashboardData } from "@/lib/data";
import { contentStatuses } from "@/lib/types";

const statusLabels: Record<string, string> = {
  idea: "Idea",
  brief: "Brief",
  draft: "Draft",
  visual: "Visual",
  approval: "Approval",
  scheduled: "Scheduled",
  published: "Published",
  analyzed: "Analyzed"
};

export default async function ContentPipelinePage() {
  const { brands, contentItems } = await getDashboardData();
  const brandMap = byId(brands);

  return (
    <>
      <PageHeader
        eyebrow="Workflow"
        title="Content Pipeline"
        description="Kanban view for AI-assisted content production. Cards can later become draggable records backed by Supabase updates."
      />
      <div className="grid gap-4 overflow-x-auto pb-3 xl:grid-cols-4 2xl:grid-cols-8">
        {contentStatuses.map((status) => {
          const items = contentItems.filter((item) => item.status === status);
          return (
            <section key={status} className="min-h-[360px] min-w-72 rounded-lg border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{statusLabels[status]}</h2>
                <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-950 dark:text-slate-300">{items.length}</span>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel dark:border-slate-800 dark:bg-slate-950">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-command">{brandMap.get(item.brand_id)?.name}</div>
                    <h3 className="mt-2 text-sm font-semibold leading-5">{item.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{item.platform}</span>
                      <span>{item.content_type}</span>
                    </div>
                    <div className="mt-4 text-xs text-slate-500">Assigned to</div>
                    <div className="mt-1 text-sm font-medium">{item.assigned_agent}</div>
                    <div className="mt-4">
                      <ApprovalStatusBadge status={item.approval_status} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
