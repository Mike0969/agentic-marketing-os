import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAnalysisStatus, startBrandAnalysis } from "@/lib/marketing/brand-analysis";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Brands → Analyze: Crina proposes improved brand fields from the brand's materials (background job;
 * the proposals appear as "Proposed — use / dismiss"; Telegram + Slack are told when they are ready).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
  return NextResponse.json({ background: true, status: startBrandAnalysis(id, request.url) }, { status: 202 });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  return NextResponse.json({ status: getAnalysisStatus(id) });
}
