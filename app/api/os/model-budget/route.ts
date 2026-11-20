import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getBudgetStatus, saveBudgetSettings } from "@/lib/budget/model-budget";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ budget: await getBudgetStatus() });
}

/** Settings: { perCampaignMax, perDayMax } — whole numbers within the DB limits. */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const perCampaignMax = Number(body?.perCampaignMax);
  const perDayMax = Number(body?.perDayMax);
  if (!Number.isInteger(perCampaignMax) || perCampaignMax < 1 || perCampaignMax > 10000 || !Number.isInteger(perDayMax) || perDayMax < 1 || perDayMax > 100000) {
    return NextResponse.json({ error: "Use whole numbers: per campaign 1–10000, per day 1–100000." }, { status: 400 });
  }
  const error = await saveBudgetSettings({ perCampaignMax, perDayMax });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ budget: await getBudgetStatus() });
}
