import { NextResponse } from "next/server";
import { requireProvider } from "@/app/api/os/providers/[provider]/_shared";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const resolved = await requireProvider(context.params);
  if (!resolved.ok) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as { prompt?: unknown; model?: unknown };
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : resolved.meta.kind === "channel"
        ? "Agentic OS test"
        : "Reply with the single word: pong";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : resolved.meta.defaultModel;

  const result = await resolved.providerModule.testCall(prompt, model).catch((error) => ({
    ok: false,
    model: model ?? "",
    response: "",
    latencyMs: 0,
    error: error instanceof Error ? error.message : "Provider test failed."
  }));

  return NextResponse.json({
    provider: resolved.provider,
    ok: result.ok,
    model: result.model,
    response: result.response,
    latencyMs: result.latencyMs,
    error: result.error
  });
}
