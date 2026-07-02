import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { defaultRegion, pickScheduledAt } from "@/lib/marketing/auto-schedule";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

type Schedulable = {
  id: string;
  brand_id: string;
};

export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true, updated: 0, skipped: "no_supabase" });
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });

  const { data: items, error } = await supabase
    .from("content_items")
    .select("id,brand_id")
    .eq("status", "scheduled")
    .eq("approval_status", "approved")
    .is("archived_at", null)
    .is("scheduled_at", null)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (items ?? []) as Schedulable[];
  const futureCountByBrand = new Map<string, number>();
  const touched: string[] = [];

  for (const item of rows) {
    if (!futureCountByBrand.has(item.brand_id)) {
      const { count } = await supabase
        .from("content_items")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", item.brand_id)
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .gte("scheduled_at", new Date().toISOString());
      futureCountByBrand.set(item.brand_id, count ?? 0);
    }

    const slotIndex = futureCountByBrand.get(item.brand_id) ?? 0;
    const scheduledAt = pickScheduledAt(defaultRegion(), slotIndex);
    const { error: updateError } = await supabase
      .from("content_items")
      .update({ scheduled_at: scheduledAt, workflow_stage: "publishing_prep" })
      .eq("id", item.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    futureCountByBrand.set(item.brand_id, slotIndex + 1);
    touched.push(item.id);
  }

  revalidatePath("/marketing/schedule");
  revalidatePath("/marketing/ready-to-post");
  return NextResponse.json({ ok: true, updated: touched.length, ids: touched });
}
