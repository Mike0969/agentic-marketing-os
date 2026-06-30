import { ScheduleCalendar } from "@/components/os/schedule-calendar";
import { OSMetric, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const data = await getDashboardData();
  const items = data.contentItems.filter((item) => item.status === "scheduled" || item.status === "published" || Boolean(item.scheduled_at));

  const scheduled = items.filter((item) => item.scheduled_at && item.status !== "published").length;
  const needsTime = items.filter((item) => !item.scheduled_at).length;
  const posted = items.filter((item) => item.status === "published").length;

  return (
    <>
      <PageHeading
        eyebrow="Marketing OS"
        title="Schedule"
        subtitle="Your week of posts by day, time, and platform. Approved posts land here automatically; posting runs from this schedule. Click a post to reschedule or remove."
      />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <OSMetric label="Scheduled" value={scheduled} hint="Queued to post" />
        <OSMetric label="Needs a time" value={needsTime} hint="Approved, not scheduled yet" />
        <OSMetric label="Posted" value={posted} hint="Already published" />
      </div>
      <ScheduleCalendar items={items} brands={data.brands} />
    </>
  );
}
