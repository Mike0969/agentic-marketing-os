import { NextResponse } from "next/server";
import { makeActivity } from "@/lib/activity";
import { updateLocalBrand } from "@/lib/local-store";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = (await request.json()) as Partial<Brand>;
  const patch = compact({
    website: body.website,
    positioning: body.positioning,
    target_audience: body.target_audience,
    tone_of_voice: body.tone_of_voice,
    active: body.active
  });

  if (isSupabaseConfigured()) {
    const supabase = await createClient();

    if (supabase) {
      const { data, error } = await supabase.from("brands").update(patch).eq("id", id).select("*").single();

      if (!error && data) {
        await supabase.from("activity").insert(makeActivity("Brand profile updated", `${data.name} strategic profile was saved.`));
        return NextResponse.json({ brand: data });
      }
    }
  }

  const brand = await updateLocalBrand(id, patch);

  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  return NextResponse.json({ brand });
}

function compact<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
