import { PageHeading } from "@/components/os/ui";

export const dynamic = "force-dynamic";

// The graph is a committed, self-contained snapshot (public/brain/graph.html) with a
// locally vendored vis-network, so it always deploys and needs no runtime fs check.
// It runs in an allow-scripts-only sandbox: opaque origin, cannot reach the admin parent.
export default function BrainPage() {
  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Business Brain"
        subtitle="Cross-venture knowledge graph — marketing, trading, GridFactory, Gulf-EL/NexRide, sourcing. Refresh with `npm run brain:graph`."
      />
      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <iframe
          src="/brain/graph.html"
          title="Business Brain knowledge graph"
          sandbox="allow-scripts"
          className="h-full w-full border-0"
        />
      </div>
    </>
  );
}
