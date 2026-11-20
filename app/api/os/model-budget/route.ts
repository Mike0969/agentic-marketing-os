import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getBudgetStatus, saveBudgetSettings } from "@/lib/budget/model-budget";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ budget: await getBudgetStatus() });
}

/** Settings: { perDayUsd, perCampaignUsd } in dollars (enforced) + the call counts kept for display. */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const current = await getBudgetStatus();
  // Empty = no limit (the default). A number = an optional cap in dollars.
  const cap = (v: unknown) => (v === null || v === undefined || (typeof v === "string" && !v.trim()) ? null : Number(v));
  const perDayUsd = cap(body?.perDayUsd);
  const perCampaignUsd = cap(body?.perCampaignUsd);
  const bad = (n: number | null) => n !== null && (!Number.isFinite(n) || n <= 0 || n > 1000);
  if (bad(perDayUsd) || bad(perCampaignUsd)) {
    return NextResponse.json({ error: "Leave a field empty for no limit, or give a dollar amount above 0 (up to 1000)." }, { status: 400 });
  }
  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  const error = await saveBudgetSettings({ perCampaignMax: current?.perCampaignMax ?? 40, perDayMax: current?.perDayMax ?? 150, perDayUsd: round(perDayUsd), perCampaignUsd: round(perCampaignUsd) });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ budget: await getBudgetStatus() });
}
