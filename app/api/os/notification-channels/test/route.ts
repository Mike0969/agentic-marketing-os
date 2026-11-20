import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isChannelKind, resolveChannel } from "@/lib/notify/channels";
import { send as sendSlack } from "@/lib/providers/slack";
import { send as sendTelegram } from "@/lib/providers/telegram";

/** "Send test message" to the channel the app uses for this kind right now (Settings first, else server env). */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  if (!isChannelKind(body?.kind)) return NextResponse.json({ ok: false, detail: "kind must be telegram or slack." }, { status: 400 });
  const ch = await resolveChannel(body.kind);
  if (!ch) return NextResponse.json({ ok: false, detail: `${body.kind === "telegram" ? "Telegram" : "Slack"} is not set up yet.` }, { status: 404 });
  const text = "Marketing OS: test message from Settings. Notifications work.";
  const result = body.kind === "telegram" ? await sendTelegram(ch.channelId, text, ch.token) : await sendSlack(ch.channelId, text, ch.token);
  return NextResponse.json({ ok: result.ok, detail: result.ok ? `Test message sent (${ch.source === "ui" ? "set in Settings" : "server environment"}).` : result.error ?? "Send failed." });
}
