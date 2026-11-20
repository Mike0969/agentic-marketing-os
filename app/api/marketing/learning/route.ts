import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { addLearningItem, listLearningItems } from "@/lib/learning/library";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  try {
    return NextResponse.json({ items: await listLearningItems() });
  } catch (error) {
    return NextResponse.json({ items: [], error: error instanceof Error ? error.message : "Could not list." });
  }
}

/** Add an item: multipart form (with an optional file) or JSON. */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  try {
    let input: Parameters<typeof addLearningItem>[0];
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      input = { type: form.get("type"), title: form.get("title"), brandId: form.get("brandId"), tags: form.get("tags"), url: form.get("url"), notes: form.get("notes"), file: file instanceof File ? file : null };
    } else {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      input = { type: body.type, title: body.title, brandId: body.brandId, tags: body.tags, url: body.url, notes: body.notes };
    }
    return NextResponse.json({ item: await addLearningItem(input) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add the item." }, { status: 400 });
  }
}
