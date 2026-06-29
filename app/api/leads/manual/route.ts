import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { captureLead } from "@/lib/marketing/leads";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await captureLead({ ...body, source: "manual", notes: body.notes ?? `Logged by ${admin.email ?? "operator"}` });

  if (!result.ok) return NextResponse.json({ error: result.error ?? "Failed to log lead." }, { status: result.status });

  revalidatePath("/sales");
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
