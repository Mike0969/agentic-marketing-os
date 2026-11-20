import { OSBadge, OSPanel, PageHeading } from "@/components/os/ui";
import { getDashboardData } from "@/lib/data";
import { defaultVault, listLearningNotes } from "@/lib/learning/vault";

export const dynamic = "force-dynamic";

// The graph is a committed, self-contained snapshot (public/brain/graph.html) with a
// locally vendored vis-network, so it always deploys and needs no runtime fs check.
// It runs in an allow-scripts-only sandbox: opaque origin, cannot reach the admin parent.
export default async function BrainPage() {
  const data = await getDashboardData();
  const brand = data.brands.find((item) => item.active) ?? data.brands[0] ?? null;
  const notes = await listLearningNotes(defaultVault(brand?.name));
  const rejected = notes.filter((note) => note.kind === "rejected");
  const approved = notes.filter((note) => note.kind === "approved");

  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Business Brain"
        subtitle="What the agents have learned from your decisions, plus the cross-venture knowledge graph."
      />

      <OSPanel className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-neutral-50">{brand?.name ?? "Brand"} learning notes</h2>
          <OSBadge tone="warn">{rejected.length} don&apos;t repeat</OSBadge>
          <OSBadge tone="ok">{approved.length} good examples</OSBadge>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
          Every Rework you ask for is saved here with your reason, and every Yes as a good example. Crina, every agent and Jev read these notes before
          they work. <strong className="text-neutral-200">This is memory the agents read every time, not model training</strong>: the models themselves do not change.
        </p>
        <p className="mt-1 text-xs text-neutral-500">Stored as markdown notes (Obsidian-style) in projects/&lt;brand&gt;/learning on the server.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <NoteList title="Don't repeat" notes={rejected} empty="Nothing rejected yet." />
          <NoteList title="Good examples" notes={approved} empty="Nothing approved yet." />
        </div>
      </OSPanel>

      <h2 className="mb-2 text-lg font-semibold text-neutral-50">Knowledge graph</h2>
      <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <iframe src="/brain/graph.html" title="Business Brain knowledge graph" sandbox="allow-scripts" className="h-full w-full border-0" />
      </div>
    </>
  );
}

function NoteList({ title, notes, empty }: { title: string; notes: Awaited<ReturnType<typeof listLearningNotes>>; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>
      {notes.length ? (
        <ul className="mt-2 space-y-2">
          {notes.slice(0, 12).map((note) => (
            <li key={note.file} className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <OSBadge tone="off">{note.part}</OSBadge>
                {note.date} · {note.campaign} · {note.platform}
              </div>
              {note.reason ? <p className="mt-1 text-neutral-200">{note.kind === "rejected" ? "Why: " : ""}{note.reason}</p> : null}
              <p className="mt-1 line-clamp-3 text-neutral-400">{note.item}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">{empty}</p>
      )}
    </div>
  );
}
