import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testUserProvider } from "@/lib/providers/user-providers";

/** "Test": the provider accepts the key (its /models call; no tokens spent). */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    return NextResponse.json(await testUserProvider(id));
  } catch (error) {
    return NextResponse.json({ ok: false, detail: error instanceof Error ? error.message : "Test failed." }, { status: 400 });
  }
}
