// Email unsubscribe + suppression (server only).
// Links carry an HMAC-signed token (EMAIL_UNSUBSCRIBE_SECRET) naming the address, so
// nobody can unsubscribe someone else by guessing. Suppression is global per address.
import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

type Env = Record<string, string | undefined>;

export type SuppressionReason = "unsubscribe" | "bounce" | "complaint" | "manual";

type Db = Pick<SupabaseClient, "from">;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes a URL for an href and refuses anything that is not http(s). */
export function safeHref(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "#";
    return escapeHtml(u.href);
  } catch {
    return "#";
  }
}

function secret(env: Env) {
  return env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || "";
}

function mac(payload: string, key: string) {
  return createHmac("sha256", key).update(`unsubscribe:v1:${payload}`).digest("base64url");
}

export function signUnsubscribeToken(email: string, env: Env = process.env): string | null {
  const key = secret(env);
  if (!key) return null;
  const payload = Buffer.from(normalizeEmail(email), "utf8").toString("base64url");
  return `${payload}.${mac(payload, key)}`;
}

/** Returns the address when the token is genuine, otherwise null. */
export function verifyUnsubscribeToken(token: string, env: Env = process.env): string | null {
  const key = secret(env);
  if (!key || typeof token !== "string") return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const email = Buffer.from(payload, "base64url").toString("utf8");
  return email.includes("@") ? email : null;
}

/** The public unsubscribe URL, or null when the site URL or the secret is missing. */
export function unsubscribeUrl(email: string, env: Env = process.env): string | null {
  const base = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  const token = signUnsubscribeToken(email, env);
  if (!base || !token) return null;
  return `${base}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click headers for a message to `email`. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/**
 * "unknown" when the list cannot be read (outage, or migration 0030 not applied yet): the
 * caller must not send, but must also not treat the address as unsubscribed.
 */
export async function suppressionStatus(db: Db, email: string): Promise<"suppressed" | "clear" | "unknown"> {
  const { data, error } = await db.from("email_suppressions").select("email").eq("email", normalizeEmail(email)).maybeSingle();
  if (error) return "unknown";
  return data ? "suppressed" : "clear";
}

export async function suppressEmail(db: Db, email: string, reason: SuppressionReason, source: string) {
  const address = normalizeEmail(email);
  const { error } = await db
    .from("email_suppressions")
    .upsert({ email: address, reason, source, created_at: new Date().toISOString() }, { onConflict: "email" });
  if (error) return { ok: false as const, error: error.message as string };
  // Stop any active drip for this exact address (lead emails are stored lowercased). Never a
  // LIKE pattern: "%" or "_" in the signed address must not match other people.
  const { data: leads } = await db.from("leads").select("id").eq("email", address);
  const ids = ((leads ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (ids.length) {
    await db.from("lead_nurture").update({ status: "stopped", updated_at: new Date().toISOString() }).in("lead_id", ids).eq("status", "active");
  }
  return { ok: true as const };
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/**
 * GET shows a confirmation button and changes nothing (mail scanners prefetch links).
 * POST (the button, or a mail client's RFC 8058 one-click POST) adds the address to
 * the suppression list.
 */
export async function handleUnsubscribe(request: Request, deps: { db: Db | null; env?: Env }): Promise<Response> {
  const env = deps.env ?? process.env;
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const email = verifyUnsubscribeToken(token, env);
  if (!email) return page("Link not valid", "<h1>This unsubscribe link is not valid.</h1><p>Please use the link from your most recent email.</p>", 400);

  if (request.method === "GET") {
    const action = `${url.pathname}?t=${encodeURIComponent(token)}`;
    return page(
      "Unsubscribe",
      `<h1>Unsubscribe</h1><p>Stop marketing emails to <strong>${escapeHtml(email)}</strong>?</p><form method="post" action="${escapeHtml(action)}"><button type="submit">Unsubscribe</button></form>`
    );
  }

  if (!deps.db) return page("Try again later", "<h1>Please try again later.</h1>", 503);
  const result = await suppressEmail(deps.db, email, "unsubscribe", "link");
  if (!result.ok) return page("Try again later", "<h1>Please try again later.</h1>", 500);
  return page("Unsubscribed", `<h1>You are unsubscribed.</h1><p>${escapeHtml(email)} will not receive further marketing emails.</p>`);
}
