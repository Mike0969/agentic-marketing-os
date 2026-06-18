import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addModel, listModels, removeModel } from "@/lib/agents/model-registry";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ models: await listModels() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { name?: string; provider?: string; notes?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Model name is required." }, { status: 400 });

  const model = await addModel({ name, provider: body.provider?.trim(), notes: body.notes?.trim() });
  return NextResponse.json({ model });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  await removeModel(id);
  return NextResponse.json({ ok: true });
}
