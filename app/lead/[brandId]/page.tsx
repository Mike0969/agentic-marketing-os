import { notFound } from "next/navigation";
import { LeadCaptureForm } from "@/app/lead/[brandId]/lead-capture-form";
import { OSBadge, OSPanel } from "@/components/os/ui";
import { seedData } from "@/lib/seed";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getPublicBrand(brandId: string): Promise<Brand | null> {
  if (!isSupabaseConfigured()) return seedData.brands.find((b) => b.id === brandId) ?? null;
  const supabase = createServiceClient() ?? (await createClient());
  if (!supabase) return null;
  const { data, error } = await supabase.from("brands").select("*").eq("id", brandId).maybeSingle();
  if (error || !data) return null;
  return data as Brand;
}

export default async function PublicLeadPage({ params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const brand = await getPublicBrand(brandId);
  if (!brand) notFound();

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-neutral-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <OSBadge tone="info">{brand.name}</OSBadge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-50">Request investor materials</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Share where you are in diligence and what you need next. Deck, memo, and call requests go straight into the investor conversion loop.
          </p>
        </div>
        <OSPanel>
          <LeadCaptureForm brandId={brand.id} token={process.env.LEAD_FORM_TOKEN?.trim() || null} />
        </OSPanel>
      </div>
    </main>
  );
}
