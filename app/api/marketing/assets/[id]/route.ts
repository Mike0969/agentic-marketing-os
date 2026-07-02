import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { updateProjectAsset } from "@/lib/marketing/project-assets";
import { createServiceClient } from "@/lib/supabase/service";
import type { ProjectAsset } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch: Partial<ProjectAsset> = {};
  for (const key of ["approved", "mandatory", "reuse_allowed"] as const) {
    if (typeof body[key] === "boolean") patch[key] = body[key] as boolean;
  }
  for (const key of ["title", "description", "content_theme", "visual_style", "rights_status"] as const) {
    if (typeof body[key] === "string") patch[key] = body[key] as string;
  }
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
  if (Array.isArray(body.platform_fit)) patch.platform_fit = body.platform_fit.map(String);
  if (typeof body.quality_score === "number") patch.quality_score = Math.max(0, Math.min(100, Math.round(body.quality_score)));

  if (!Object.keys(patch).length) return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  const asset = await updateProjectAsset(id, patch);
  if (!asset) return NextResponse.json({ error: "Asset not found or update failed." }, { status: 404 });
  revalidatePath("/marketing/assets");
  return NextResponse.json({ asset });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: "Storage not available." }, { status: 503 });
  const { error } = await supabase.from("project_assets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/marketing/assets");
  return NextResponse.json({ ok: true });
}
