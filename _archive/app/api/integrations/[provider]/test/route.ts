import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeProvider } from "@/lib/integrations";
import { testIntegration } from "@/lib/integration-store";

type Context = {
  params: Promise<{ provider: string }>;
};

export async function POST(_request: Request, context: Context) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { provider: rawProvider } = await context.params;
  const provider = normalizeProvider(rawProvider);

  if (!provider) {
    return NextResponse.json({ error: "Unsupported integration provider." }, { status: 400 });
  }

  const result = await testIntegration(provider);
  return NextResponse.json(result);
}
