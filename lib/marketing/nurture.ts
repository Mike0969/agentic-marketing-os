import { emailConfigured, sendEmail } from "@/lib/email/resend";
import { escapeHtml, isSuppressed, safeHref, unsubscribeHeaders, unsubscribeUrl } from "@/lib/email/unsubscribe";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// The nurture drip: post -> capture -> EMAIL -> convert -> subscribe. Structure + delays live here
// (Claude's lane); the real per-brand copy is Codex's lane (hermes-brain/nurture-sequences.md). The
// inline fallback copy below keeps the funnel functional today and is replaced by Codex's sequences.

// Every ctx value is ALREADY HTML-escaped by renderNurtureEmail (name/brand are user-controlled).
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

/** Renders one step with escaped values and the unsubscribe footer. */
export function renderNurtureEmail(step: number, raw: { name: string; brand: string; subscribeUrl: string; unsubscribeUrl: string }) {
  const def = DEFAULT_SEQUENCE[step];
  if (!def) return null;
  const ctx = { name: escapeHtml(raw.name), brand: escapeHtml(raw.brand), subscribeUrl: safeHref(raw.subscribeUrl) };
  const footer = `<p style="font-size:12px;color:#666">You received this because you asked about ${ctx.brand}. <a href="${safeHref(raw.unsubscribeUrl)}">Unsubscribe</a></p>`;
  return { subject: def.subject, html: def.html(ctx) + footer };
}

type DripDeps = {
  db?: Awaited<ReturnType<typeof db>>;
  send?: typeof sendEmail;
  env?: Record<string, string | undefined>;
};

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
export async function runNurtureDrip(limit = 25, deps: DripDeps = {}) {
  const env = deps.env ?? process.env;
  const send = deps.send ?? sendEmail;
  const supabase = deps.db !== undefined ? deps.db : await db();
  if (!supabase) return { sent: 0, skipped: "no-db" as const };
  if (!(deps.send ? true : emailConfigured())) return { sent: 0, skipped: "no-resend-key" as const };
  // Never send marketing email without a working unsubscribe link.
  const subscribeBase = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "";
  if (!subscribeBase || !env.EMAIL_UNSUBSCRIBE_SECRET?.trim()) return { sent: 0, skipped: "no-unsubscribe-config" as const };

  const nowIso = new Date().toISOString();
  const { data: due } = await supabase.from("lead_nurture").select("*").eq("status", "active").lte("next_send_at", nowIso).limit(limit);
  const rows = (due ?? []) as Array<{ id: string; lead_id: string; brand_id: string; sequence_key: string; step: number }>;
  let sent = 0;
  let suppressed = 0;

  for (const row of rows) {
    if (!DEFAULT_SEQUENCE[row.step]) {
      await supabase.from("lead_nurture").update({ status: "completed", updated_at: nowIso }).eq("id", row.id);
      continue;
    }
    const { data: lead } = await supabase.from("leads").select("email,name").eq("id", row.lead_id).maybeSingle();
    const { data: brand } = await supabase.from("brands").select("name").eq("id", row.brand_id).maybeSingle();
    if (!lead?.email) {
      await supabase.from("lead_nurture").update({ status: "error", updated_at: nowIso }).eq("id", row.id);
      continue;
    }
    const subject = DEFAULT_SEQUENCE[row.step].subject;
    if (await isSuppressed(supabase, lead.email)) {
      await supabase.from("email_sends").insert({
        lead_id: row.lead_id,
        brand_id: row.brand_id,
        to_email: lead.email,
        subject,
        sequence_key: row.sequence_key,
        step: row.step,
        provider_id: null,
        status: "suppressed",
        error: null
      });
      await supabase.from("lead_nurture").update({ status: "stopped", updated_at: nowIso }).eq("id", row.id);
      suppressed += 1;
      continue;
    }
    const unsub = unsubscribeUrl(lead.email, env)!;
    const email = renderNurtureEmail(row.step, { name: lead.name || "there", brand: brand?.name || "us", subscribeUrl: `${subscribeBase}/lead/${row.brand_id}`, unsubscribeUrl: unsub })!;
    const res = await send({ to: lead.email, subject: email.subject, html: email.html, headers: unsubscribeHeaders(unsub) });
    await supabase.from("email_sends").insert({
      lead_id: row.lead_id,
      brand_id: row.brand_id,
      to_email: lead.email,
      subject: email.subject,
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

  return { sent, suppressed, due: rows.length };
}
