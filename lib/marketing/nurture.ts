import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// The nurture drip: post -> capture -> EMAIL -> convert -> subscribe. Structure + delays live here
// (Claude's lane); the real per-brand copy is Codex's lane (hermes-brain/nurture-sequences.md). The
// inline fallback copy below keeps the funnel functional today and is replaced by Codex's sequences.

type Step = { delayDays: number; subject: string; html: (ctx: { name: string; brand: string; subscribeUrl: string }) => string };

const DEFAULT_SEQUENCE: Step[] = [
  {
    delayDays: 0,
    subject: "Thanks — here's what happens next",
    html: (c) => `<p>Hi ${c.name},</p><p>Thanks for your interest in <strong>${c.brand}</strong>. Over the next few days I'll show you exactly how this works and how you can take part.</p>`
  },
  {
    delayDays: 2,
    subject: "Why this is different",
    html: (c) => `<p>Hi ${c.name},</p><p>Here's the core of what makes <strong>${c.brand}</strong> worth a serious look — the mechanism, the proof, and where the upside sits.</p>`
  },
  {
    delayDays: 3,
    subject: "Ready to take part?",
    html: (c) => `<p>Hi ${c.name},</p><p>If you're ready to join <strong>${c.brand}</strong>, here's how to subscribe and get started.</p><p><a href="${c.subscribeUrl}">Subscribe / get started →</a></p>`
  }
];

async function db() {
  if (!isSupabaseConfigured()) return null;
  return createServiceClient() ?? (await createClient());
}

/** Enroll a freshly captured lead into the nurture drip (first email due immediately). */
export async function enrollLead(leadId: string, brandId: string) {
  const supabase = await db();
  if (!supabase) return;
  await supabase.from("lead_nurture").upsert(
    { lead_id: leadId, brand_id: brandId, sequence_key: "default", step: 0, status: "active", next_send_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { onConflict: "lead_id" }
  );
}

/** Cron drip: send the due email for each active lead, log it, and advance the step. */
export async function runNurtureDrip(limit = 25) {
  const supabase = await db();
  if (!supabase) return { sent: 0, skipped: "no-db" as const };
  if (!emailConfigured()) return { sent: 0, skipped: "no-resend-key" as const };

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase.from("lead_nurture").select("*").eq("status", "active").lte("next_send_at", nowIso).limit(limit);
  const rows = (due ?? []) as Array<{ id: string; lead_id: string; brand_id: string; sequence_key: string; step: number }>;
  const subscribeBase = process.env.NEXT_PUBLIC_SITE_URL || "";
  let sent = 0;

  for (const row of rows) {
    const stepDef = DEFAULT_SEQUENCE[row.step];
    if (!stepDef) {
      await supabase.from("lead_nurture").update({ status: "completed", updated_at: nowIso }).eq("id", row.id);
      continue;
    }
    const { data: lead } = await supabase.from("leads").select("email,name").eq("id", row.lead_id).maybeSingle();
    const { data: brand } = await supabase.from("brands").select("name").eq("id", row.brand_id).maybeSingle();
    if (!lead?.email) {
      await supabase.from("lead_nurture").update({ status: "error", updated_at: nowIso }).eq("id", row.id);
      continue;
    }
    const ctx = { name: lead.name || "there", brand: brand?.name || "us", subscribeUrl: `${subscribeBase}/lead/${row.brand_id}` };
    const res = await sendEmail({ to: lead.email, subject: stepDef.subject, html: stepDef.html(ctx) });
    await supabase.from("email_sends").insert({
      lead_id: row.lead_id,
      brand_id: row.brand_id,
      to_email: lead.email,
      subject: stepDef.subject,
      sequence_key: row.sequence_key,
      step: row.step,
      provider_id: res.id ?? null,
      status: res.ok ? "sent" : "error",
      error: res.ok ? null : res.error ?? null
    });
    if (res.ok) sent += 1;

    const nextStep = row.step + 1;
    const nextDef = DEFAULT_SEQUENCE[nextStep];
    await supabase
      .from("lead_nurture")
      .update(
        nextDef
          ? { step: nextStep, next_send_at: new Date(Date.now() + nextDef.delayDays * 86_400_000).toISOString(), last_sent_at: nowIso, updated_at: nowIso }
          : { status: "completed", last_sent_at: nowIso, updated_at: nowIso }
      )
      .eq("id", row.id);
  }

  return { sent, due: rows.length };
}
