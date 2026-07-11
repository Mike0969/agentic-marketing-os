import { NextResponse } from "next/server";
import { requireAgentAccessOrLocalhost } from "@/lib/auth";
import { computeReadiness } from "@/lib/health/readiness";

// GET /api/health — autonomy readiness self-check.
//
// Reports whether the autonomous loop is wired for real operation or running in
// fallback. Configuration-only (no live network calls); returns env NAMES that are
// missing, never secret values. Gated like the automation cron so it is safe to
// hit from a machine trigger or an admin session, and from localhost in dev.
export async function GET(request: Request) {
  const access = await requireAgentAccessOrLocalhost(request);
  if (!access.ok) return access.response;

  const report = computeReadiness(process.env as Record<string, string | undefined>);
  const httpStatus = report.overall === "fallback" ? 503 : 200;
  return NextResponse.json(report, { status: httpStatus });
}
