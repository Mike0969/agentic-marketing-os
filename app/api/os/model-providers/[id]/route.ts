import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { removeUserProvider, updateUserProvider } from "@/lib/providers/user-providers";

/** Rename, enable/disable, replace the key (never returned), change a custom base URL. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    return NextResponse.json({ provider: await updateUserProvider(id, { name: body?.name, enabled: body?.enabled, apiKey: body?.apiKey, baseUrl: body?.baseUrl }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the provider." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    await removeUserProvider(id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove the provider." }, { status: 400 });
  }
}
