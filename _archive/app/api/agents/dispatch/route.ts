import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dispatchContentItem } from "@/lib/agents/dispatch";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Approval-gated dispatch: run the assigned specialist on a single approved
 * content item and write the draft back onto the card. Never publishes.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { contentItemId?: string };
  if (!body.contentItemId) return NextResponse.json({ error: "contentItemId is required." }, { status: 400 });

  const result = await dispatchContentItem(body.contentItemId);
  if (!result.item) return NextResponse.json({ error: result.error ?? "Dispatch failed." }, { status: 404 });

  return NextResponse.json(result, { headers: { "x-agent-provider": result.provider } });
}
