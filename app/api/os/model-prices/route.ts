import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listModelPrices } from "@/lib/budget/model-budget";
import { createServiceClient } from "@/lib/supabase/service";

/** Settings → Model prices: $ per 1M input/output tokens and $ per call, per provider/model. Admin only. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ prices: await listModelPrices(true) });
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN);

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider.trim().toLowerCase() : "";
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "*";
  const inP = num(body?.usdPerMIn), outP = num(body?.usdPerMOut), perCall = num(body?.usdPerCall ?? 0);
  if (!/^[a-z0-9:*._-]{1,60}$/.test(provider) || model.length > 120) return NextResponse.json({ error: "Give a provider (e.g. openai) and a model (or * for all its models)." }, { status: 400 });
  if (![inP, outP, perCall].every((n) => Number.isFinite(n) && n >= 0 && n <= 10000)) return NextResponse.json({ error: "Prices must be numbers from 0 to 10000 (dollars)." }, { status: 400 });
  const db = createServiceClient();
  if (!db) return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  const { error } = await db.from("model_prices").upsert(
    { provider, model, usd_per_m_in: inP, usd_per_m_out: outP, usd_per_call: perCall, verified: true, note: "set in Settings", updated_at: new Date().toISOString() },
    { onConflict: "provider,model" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prices: await listModelPrices(true) });
}
