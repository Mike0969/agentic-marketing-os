import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { recordChannelTest, resolveChannel } from "@/lib/notify/channels";
import { send as sendSlack } from "@/lib/providers/slack";
import { send as sendTelegram } from "@/lib/providers/telegram";

/** "Send test message" to exactly this channel. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
  const kind = body?.kind === "slack" ? "slack" : body?.kind === "telegram" ? "telegram" : null;
  if (!kind) return NextResponse.json({ ok: false, detail: "kind is required." }, { status: 400 });
  const ch = await resolveChannel(kind, id);
  if (!ch) return NextResponse.json({ ok: false, detail: "Channel not found." }, { status: 404 });
  const text = "Marketing OS: test message from Settings. Notifications work.";
  const result = kind === "telegram" ? await sendTelegram(ch.channelId, text, ch.token) : await sendSlack(ch.channelId, text, ch.token);
  const detail = result.ok ? "Test message sent." : result.error ?? "Send failed.";
  await recordChannelTest(id, result.ok, detail).catch(() => {});
  return NextResponse.json({ ok: result.ok, detail });
}
