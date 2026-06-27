import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Operator logs real conversion outcomes for a campaign (manual source).
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const brandId = typeof body.brand_id === "string" ? body.brand_id.trim() : "";
  if (!brandId) return NextResponse.json({ error: "brand_id is required." }, { status: 400 });

  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  const awareness = n(body.awareness);
  const signups = n(body.signups);
  const paid = n(body.paid);

  const row = {
    brand_id: brandId,
    campaign_id: typeof body.campaign_id === "string" && body.campaign_id ? body.campaign_id : null,
    source: "manual",
    awareness,
    signups,
    activations: n(body.activations),
    paid,
    revenue: n(body.revenue),
    signup_rate: awareness ? signups / awareness : null,
    paid_conversion_rate: signups ? paid / signups : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    recorded_by: admin.email ?? "operator",
    estimate_confidence: "high"
  };

  const { data, error } = await supabase.from("conversion_outcomes").insert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/sales");
  revalidatePath("/");
  return NextResponse.json({ outcome: data });
}
