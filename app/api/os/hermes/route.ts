import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getOsWorkflowConfig, runOsWorkflow, type OsWorkflowKey } from "@/lib/os-workflows";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = (await request.json().catch(() => ({}))) as { workflow?: OsWorkflowKey; input?: Record<string, unknown> };
  if (!body.workflow || !getOsWorkflowConfig(body.workflow)) {
    return NextResponse.json({ error: "Supported workflow is required." }, { status: 400 });
  }

  const result = await runOsWorkflow(body.workflow, body.input ?? {});
  return NextResponse.json(result, {
    headers: {
      "x-agent-provider": result.provider,
      "x-agent-fallback": result.fallback ? "true" : "false",
      "x-live-execution": "disabled"
    }
  });
}
