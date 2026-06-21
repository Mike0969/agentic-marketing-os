import { NextResponse } from "next/server";
import { requireProvider } from "@/app/api/os/providers/[provider]/_shared";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const resolved = await requireProvider(context.params);
  if (!resolved.ok) return resolved.response;

  const health = await resolved.providerModule.healthCheck().catch((error) => ({
    status: "error" as const,
    configured: false,
    connected: false,
    detail: error instanceof Error ? error.message : "Provider health failed.",
    model: undefined,
    latencyMs: undefined
  }));

  return NextResponse.json({
    provider: resolved.provider,
    kind: resolved.meta.kind,
    configured: health.configured,
    connected: health.connected,
    status: health.status,
    detail: health.detail,
    model: health.model,
    checkedAt: new Date().toISOString(),
    latencyMs: health.latencyMs ?? null
  });
}
