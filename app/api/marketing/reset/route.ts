import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "RESET MARKETING") {
    return NextResponse.json({ error: "Type RESET MARKETING to confirm." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Reset is available only when Supabase is configured." }, { status: 400 });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Supabase service client is not configured." }, { status: 503 });

  await supabase.from("content_assets").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("approvals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("content_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("campaigns").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase
    .from("agent_runs")
    .delete()
    .or("agent_id.ilike.agent-%,workflow_name.ilike.%Campaign%,workflow_name.ilike.%Marketing%,workflow_name.ilike.%Ready To Post%,workflow_name.ilike.%Image Asset%");

  revalidatePath("/marketing");
  revalidatePath("/marketing/campaigns");
  revalidatePath("/marketing/pipeline");
  revalidatePath("/marketing/ready-to-post");
  revalidatePath("/marketing/approvals");

  return NextResponse.json({ success: true });
}
