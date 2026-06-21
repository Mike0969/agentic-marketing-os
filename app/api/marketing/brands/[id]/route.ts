import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { makeActivity } from "@/lib/activity";
import { updateLocalBrand } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

const allowedFields = [
  "name",
  "website",
  "positioning",
  "target_audience",
  "tone_of_voice",
  "content_pillars",
  "key_messages",
  "proof_points",
  "offers",
  "competitors",
  "seo_targets",
  "approval_rules",
  "reusable_ctas"
] as const;

type BrandPatch = Pick<Brand, (typeof allowedFields)[number]>;

function cleanPatch(body: Record<string, unknown>): Partial<BrandPatch> {
  return Object.fromEntries(
    allowedFields
      .filter((field) => typeof body[field] === "string")
      .map((field) => [field, String(body[field]).trim()])
  ) as Partial<BrandPatch>;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch = cleanPatch(body);

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "No editable brand fields were provided." }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const brand = await updateLocalBrand(id, patch);
    if (!brand) return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    revalidatePath("/marketing/brands");
    revalidatePath("/marketing");
    return NextResponse.json({ brand, mode: "local" });
  }

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not available." }, { status: 503 });
  }

  const { data, error } = await supabase.from("brands").update(patch).eq("id", id).select("*").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("activity").insert(makeActivity("Brand profile updated", `${data.name} strategic profile was saved.`));

  revalidatePath("/marketing/brands");
  revalidatePath("/marketing");
  return NextResponse.json({ brand: data as Brand, mode: "supabase" });
}
