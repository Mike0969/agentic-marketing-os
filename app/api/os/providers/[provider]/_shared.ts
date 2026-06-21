import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getProvider, getProviderMeta, isProviderKey } from "@/lib/providers/registry";
import type { ProviderKey, ProviderModule } from "@/lib/providers/types";

export async function requireProvider(params: Promise<{ provider: string }>): Promise<
  | { ok: true; provider: ProviderKey; providerModule: ProviderModule; meta: ReturnType<typeof getProviderMeta> }
  | { ok: false; response: NextResponse }
> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, response: admin.response };

  const { provider } = await params;
  if (!isProviderKey(provider)) {
    return { ok: false, response: NextResponse.json({ error: "Unknown provider." }, { status: 404 }) };
  }

  return { ok: true, provider, providerModule: getProvider(provider), meta: getProviderMeta(provider) };
}
