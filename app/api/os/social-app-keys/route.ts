import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAppKeysPublic, removeAppKeys, setAppKeys } from "@/lib/social/app-keys";

/** Social platform app keys: list (secrets never returned, only last 4), save, remove. Admin only. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ keys: await listAppKeysPublic() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    await setAppKeys(body?.platform, body?.clientId, body?.clientSecret);
    return NextResponse.json({ keys: await listAppKeysPublic() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const platform = new URL(request.url).searchParams.get("platform");
  try {
    await removeAppKeys(platform);
    return NextResponse.json({ keys: await listAppKeysPublic() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove." }, { status: 400 });
  }
}
