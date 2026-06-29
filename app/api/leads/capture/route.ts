import { NextResponse } from "next/server";
import { captureLead } from "@/lib/marketing/leads";

// Public prospect write route. Keep the response intentionally minimal.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await captureLead({ ...body, source: "form" });

  if (!result.ok) {
    const malformed = String(result.error ?? "").toLowerCase().includes("email");
    return NextResponse.json({ ok: false }, { status: malformed ? 400 : 500 });
  }

  return NextResponse.json({ ok: true });
}
