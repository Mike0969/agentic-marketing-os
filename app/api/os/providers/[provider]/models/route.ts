import { NextResponse } from "next/server";
import { requireProvider } from "@/app/api/os/providers/[provider]/_shared";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const resolved = await requireProvider(context.params);
  if (!resolved.ok) return resolved.response;

  const result = await resolved.providerModule.listModels().catch(() => ({ source: "static" as const, models: [] }));

  return NextResponse.json({
    provider: resolved.provider,
    kind: resolved.meta.kind,
    source: result.source,
    models: result.models
  });
}
