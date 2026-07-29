import { PageHeading } from "@/components/os/ui";

export const dynamic = "force-dynamic";

// The dashboard is served by the local Python service (FastAPI on
// 127.0.0.1:8000 by default) and embeds itself here. Unlike the Brain tab
// (which iframes a committed static file on the same origin), the trading
// dashboard is cross-origin to this Next.js app, so the sandbox must allow
// same-origin so the iframe can open a WebSocket back to its own FastAPI host.
// Auth for this page still comes from middleware (the (shell) group is gated).
const TRADING_DASHBOARD_URL = process.env.TRADING_DASHBOARD_URL || "http://127.0.0.1:8000";

export default function TradingPage() {
  return (
    <>
      <PageHeading
        eyebrow="Agentic OS"
        title="Trading Desk"
        subtitle="Lead/lag EVWMA scanner — correlated instruments break in sequence; the lagger is the trade. Updates only on state change."
      />
      <div className="mt-4 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <iframe
          src={TRADING_DASHBOARD_URL}
          title="Lead/lag trading dashboard"
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0"
        />
      </div>
    </>
  );
}
