import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { refreshUserProviderModels } from "@/lib/providers/user-providers";

/** The provider's real chat models (from its /models), cached 6 h; POST forces a refresh. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ models: await refreshUserProviderModels(id) });
  } catch (error) {
    return NextResponse.json({ models: [], error: error instanceof Error ? error.message : "Could not list models." }, { status: 400 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    return NextResponse.json({ models: await refreshUserProviderModels(id, true) });
  } catch (error) {
    return NextResponse.json({ models: [], error: error instanceof Error ? error.message : "Could not list models." }, { status: 400 });
  }
}
