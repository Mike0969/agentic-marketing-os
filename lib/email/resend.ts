// Resend email sender (server-only). No-ops with a clear reason if RESEND_API_KEY is unset, so the
// whole funnel can ship and be wired before the key + sending domain are added.

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(args: { to: string; subject: string; html: string; from?: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };
  const from = args.from ?? process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: args.to, subject: args.subject, html: args.html }),
      signal: AbortSignal.timeout(15000)
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message ?? `Resend ${res.status}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
