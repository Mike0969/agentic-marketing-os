import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { removeChannel, updateChannel } from "@/lib/notify/channels";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    return NextResponse.json({ channel: await updateChannel(id, { name: body?.name, enabled: body?.enabled, token: body?.token, channelId: body?.channelId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the channel." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    await removeChannel(id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove the channel." }, { status: 400 });
  }
}
