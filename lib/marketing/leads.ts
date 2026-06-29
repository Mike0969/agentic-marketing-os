import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const SEGMENTS = ["investor", "operator", "developer", "utility", "other"] as const;
type Segment = (typeof SEGMENTS)[number];
type LeadSource = "form" | "manual";

export type LeadInput = {
  brand_id?: unknown;
  campaign_id?: unknown;
  name?: unknown;
  email?: unknown;
  company?: unknown;
  role?: unknown;
  segment?: unknown;
  region?: unknown;
  power_requirement?: unknown;
  timeline?: unknown;
  diligence_stage?: unknown;
  wants?: unknown;
  source?: unknown;
  notes?: unknown;
};

export type LeadRow = {
  id: string;
  brand_id: string;
  campaign_id: string | null;
  name: string | null;
  email: string;
  company: string | null;
  role: string | null;
  segment: Segment | null;
  region: string | null;
  power_requirement: string | null;
  timeline: string | null;
  diligence_stage: string | null;
  wants: string | null;
  source: LeadSource;
  notes: string | null;
  created_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(v: unknown, max = 240) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, max) : null;
}

function email(v: unknown) {
  const cleaned = text(v, 320)?.toLowerCase() ?? "";
  return EMAIL_RE.test(cleaned) ? cleaned : "";
}

function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const end = new Date(next.getTime() - 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    nextIso: next.toISOString()
  };
}

async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  return createServiceClient() ?? (await createClient());
}

export async function captureLead(input: LeadInput) {
  try {
    const brandId = text(input.brand_id, 80);
    const leadEmail = email(input.email);
    if (!brandId || !leadEmail) return { ok: false as const, error: "brand_id and valid email are required." };

    const supabase = await getSupabase();
    if (!supabase) return { ok: false as const, error: "Supabase is not available." };

    const rawSegment = text(input.segment, 40);
    const rawSource = text(input.source, 20);
    const source: LeadSource = rawSource === "manual" ? "manual" : "form";
    const segment: Segment | null = rawSegment && SEGMENTS.includes(rawSegment as Segment) ? (rawSegment as Segment) : null;

    const { data: lead, error } = await supabase
      .from("leads")
      .insert({
        brand_id: brandId,
        campaign_id: text(input.campaign_id, 80),
        name: text(input.name),
        email: leadEmail,
        company: text(input.company),
        role: text(input.role),
        segment,
        region: text(input.region),
        power_requirement: text(input.power_requirement),
        timeline: text(input.timeline),
        diligence_stage: text(input.diligence_stage),
        wants: text(input.wants),
        source,
        notes: text(input.notes, 1000)
      })
      .select("*")
      .single();

    if (error) return { ok: false as const, error: error.message };

    const period = monthWindow();
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .gte("created_at", period.startIso)
      .lt("created_at", period.nextIso);

    const signups = count ?? 0;
    await supabase
      .from("conversion_outcomes")
      .delete()
      .eq("brand_id", brandId)
      .eq("source", "lead_capture")
      .eq("period_start", period.startDate)
      .eq("period_end", period.endDate);

    await supabase.from("conversion_outcomes").insert({
      brand_id: brandId,
      campaign_id: null,
      source: "lead_capture",
      awareness: 0,
      signups,
      activations: 0,
      paid: 0,
      revenue: 0,
      signup_rate: null,
      paid_conversion_rate: null,
      period_start: period.startDate,
      period_end: period.endDate,
      recorded_by: "lead-capture",
      estimate_confidence: "high",
      notes: `${signups} real lead${signups === 1 ? "" : "s"} captured this month.`
    });

    return { ok: true as const, lead: lead as LeadRow, signups };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Lead capture failed." };
  }
}

export async function getLeads(brandId: string, limit = 25): Promise<LeadRow[]> {
  try {
    const supabase = await getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as LeadRow[];
  } catch {
    return [];
  }
}

export async function countLeads(brandId: string) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return 0;
    const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
