import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addChannel, listChannels } from "@/lib/notify/channels";

/** Settings → Notifications: UI channels (tokens never returned) + whether env fallbacks exist. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const env = {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    slack: Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID)
  };
  try {
    return NextResponse.json({ channels: await listChannels(), env });
  } catch (error) {
    return NextResponse.json({ channels: [], env, error: error instanceof Error ? error.message : "Could not list channels." });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    return NextResponse.json({ channel: await addChannel({ kind: body?.kind, name: body?.name, token: body?.token, channelId: body?.channelId }) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add the channel." }, { status: 400 });
  }
}
