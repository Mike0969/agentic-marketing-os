import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { removeLearningItem, updateLearningItem } from "@/lib/learning/library";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    return NextResponse.json({ item: await updateLearningItem(id, { title: body.title, tags: body.tags, notes: body.notes, usedByAgents: body.usedByAgents, brandId: body.brandId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await context.params;
  try {
    await removeLearningItem(id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove." }, { status: 400 });
  }
}
