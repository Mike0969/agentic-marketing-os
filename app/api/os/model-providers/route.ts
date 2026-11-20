import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PROVIDERS, isConfigured } from "@/lib/providers/registry";
import { addUserProvider, listUserProviders } from "@/lib/providers/user-providers";

/** Settings → Models: UI-added providers (keys never returned) + env providers (read-only). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const env = PROVIDERS.filter((p) => p.kind === "model" && p.key !== "hermes").map((p) => ({ key: p.key, label: p.label, configured: isConfigured(p.key), defaultModel: p.defaultModel ?? null }));
  try {
    return NextResponse.json({ providers: await listUserProviders(), env });
  } catch (error) {
    return NextResponse.json({ providers: [], env, error: error instanceof Error ? error.message : "Could not list providers." });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    const provider = await addUserProvider({ kind: body?.kind, name: body?.name, apiKey: body?.apiKey, baseUrl: body?.baseUrl });
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add the provider." }, { status: 400 });
  }
}
