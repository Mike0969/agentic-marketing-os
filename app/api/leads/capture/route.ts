import { NextResponse } from "next/server";
import { capturePublicLead } from "@/lib/marketing/leads";

// Public prospect write route. Keep the response intentionally minimal.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const result = await capturePublicLead(body, { ip });

  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
